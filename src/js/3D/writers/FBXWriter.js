/*!
	wow.export (https://github.com/Kruithne/wow.export)
	Authors: Kruithne <kruithne@gmail.com>
	License: MIT
 */
const path = require('path');
const util = require('util');
const generics = require('../../generics');
const BufferWrapper = require('../../buffer');

const PROPERTY_INT_16 = { code: 0x59, isArray: false, size: 2 };
const PROPERTY_INT_32 = { code: 0x49, isArray: false, size: 4 };
const PROPERTY_INT_64 = { code: 0x4C, isArray: false, size: 8 };
const PROPERTY_FLOAT = { code: 0x46, isArray: false, size: 4 };
const PROPERTY_DOUBLE = { code: 0x44, isArray: false, size: 8 };
const PROPERTY_BOOLEAN = { code: 0x43, isArray: false, size: 1 };
const PROPERTY_STRING = { code: 0x53, isArray: false };
const PROPERTY_BINARY = { code: 0x52, isArray: false };
const PROPERTY_ARR_INT_32 = { code: 0x69, isArray: true, size: 4 };
const PROPERTY_ARR_INT_64 = { code: 0x6C, isArray: true, size: 8 };
const PROPERTY_ARR_FLOAT = { code: 0x66, isArray: true, size: 4 };
const PROPERTY_ARR_DOUBLE = { code: 0x64, isArray: true, size: 8 };
const PROPERTY_ARR_BOOLEAN = { code: 0x62, isArray: true, size: 1 };

const FBX_VERSION = 7400;

class FBXNodeRecord {
	/**
	 * Construct a new FBXNodeRecord
	 * @param {string} name
	 * @param {object} singlePropertyType
	 * @param {mixed} singlePropertyValue
	 */
	constructor(name, singlePropertyType, ...singlePropertyValues) {
		this.name = name;
		this.properties = new Set();
		this.children = new Set();

		if (singlePropertyType !== undefined)
			this.addProperty(singlePropertyType, ...singlePropertyValues);
	}
	
	/**
	 * Add a property to this node record.
	 * @param {object} type One of the PROPERTY_ constants.
	 * @param {mixed} values A value of the given type.
	 */
	addProperty(type, ...values) {
		for (const value of values)
			this.properties.add({ type, value });
	}

	/**
	 * Add a child node to this node.
	 * Returns the first added child.
	 * @param {FBXNodeRecord} children
	 * @returns {FBXNodeRecord}
	 */
	addChild(...children) {
		for (const child of children)
			this.children.add(child);

		return children[0];
	}
}

class FBXProperty_Boolean extends FBXNodeRecord {
	constructor(name, state) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'bool', '', '');
		this.addProperty(PROPERTY_INT_32, state ? 1 : 0);
	}
}

class FBXProperty_Vector3D extends FBXNodeRecord {
	constructor(name, x, y, z) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'Vector3D', 'Vector', '');
		this.addProperty(PROPERTY_DOUBLE, x, y, z);
	}
}

class FBXProperty_ColorRGB extends FBXNodeRecord {
	constructor(name, r, g, b) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'ColorRGB', 'Color', '');
		this.addProperty(PROPERTY_DOUBLE, r, g, b);
	}
}

class FBXProperty_URL extends FBXNodeRecord {
	constructor(name, url) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'KString', 'Url', url);
	}
}

class FBXProperty_Enum extends FBXNodeRecord {
	constructor(name, value) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'enum', '', '');
		this.addProperty(PROPERTY_INT_32, value);
	}
}

class FBXProperty_Double extends FBXNodeRecord {
	constructor(name, value) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'double', 'Number', '');
		this.addProperty(PROPERTY_DOUBLE, value);
	}
}

class FBXProperty_KTime extends FBXNodeRecord {
	constructor(name, value) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'KTime', 'Time', '');
		this.addProperty(PROPERTY_INT_64, value);
	}
}

class FBXProperty_KString extends FBXNodeRecord {
	constructor(name, value) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'KString', '', '', value);
	}
}

class FBXProperty_Integer extends FBXNodeRecord {
	constructor(name, value) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'int', 'Integer', '');
		this.addProperty(PROPERTY_INT_32, value);
	}
}

class FBXProperty_Object extends FBXNodeRecord {
	constructor(name) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, 'object', '', '');
	}
}

class FBXProperty_LCLVector extends FBXNodeRecord {
	constructor(name, x, y, z) {
		super('P');
		this.addProperty(PROPERTY_STRING, name, name, '', 'A');
		this.addProperty(PROPERTY_DOUBLE, x, y, z);
	}
}

class FBXWriter {
	/**
	 * Construct a new FBXWriter instance.
	 * @param {string} out Output path to write to.
	 */
	constructor(out) {
		this.out = out;

		this.vertices = [];
		this.normals = [];
		this.uvs = [];

		this.meshes = [];
		this.name = 'Mesh';
	}

	/**
	 * Set the name of this model.
	 * @param {string} name 
	 */
	setName(name) {
		this.name = name;
	}

	/**
	 * Set the vertices for this model.
	 * @param {array} vertices 
	 */
	setVertices(vertices) {
		this.vertices = vertices;
	}

	/**
	 * Set the normals for this model.
	 * @param {array} normals 
	 */
	setNormals(normals) {
		this.normals = normals;
	}

	/**
	 * Set the UVs for this model.
	 * @param {array} uvs 
	 */
	setUVs(uvs) {
		this.uvs = uvs;
	}

	/**
	 * Constructs a creation time stamp node.
	 * This is a sub-node for the FBXHeaderExtension, not a root node.
	 * @returns {FBXNodeRecord}
	 */
	buildCreationTimeStampNode() {
		const now = new Date();
		const nrStamp = new FBXNodeRecord('CreationTimeStamp');

		nrStamp.addChild(new FBXNodeRecord('Version', PROPERTY_INT_32, 1000));
		nrStamp.addChild(new FBXNodeRecord('Year', PROPERTY_INT_32, now.getFullYear()));
		nrStamp.addChild(new FBXNodeRecord('Month', PROPERTY_INT_32, now.getMonth() + 1));
		nrStamp.addChild(new FBXNodeRecord('Day', PROPERTY_INT_32, now.getDate()));
		nrStamp.addChild(new FBXNodeRecord('Hour', PROPERTY_INT_32, now.getHours()));
		nrStamp.addChild(new FBXNodeRecord('Minute', PROPERTY_INT_32, now.getMinutes()));
		nrStamp.addChild(new FBXNodeRecord('Second', PROPERTY_INT_32, now.getSeconds()));
		nrStamp.addChild(new FBXNodeRecord('Millisecond', PROPERTY_INT_32, now.getMilliseconds()));

		return nrStamp;
	}

	/**
	 * Create a property compound.
	 * @param {string} name 
	 * @param {object} properties 
	 */
	createCompound(name, properties) {
		const nodes = [];

		const compound = new FBXNodeRecord('P', PROPERTY_STRING, name, 'Compound', '', '');
		nodes.push(compound);

		for (const [key, value] of Object.entries(properties))
			nodes.push(new FBXNodeRecord('P', PROPERTY_STRING, name + '|' + key, value.type, '', '', value.value));

		return nodes;
	}

	/**
	 * Construct a scene info node.
	 */
	buildSceneInfoNode() {
		const nrSceneInfo = new FBXNodeRecord('SceneInfo');
		nrSceneInfo.addProperty(PROPERTY_STRING, 'GlobalInfoSceneInfo');
		nrSceneInfo.addProperty(PROPERTY_STRING, 'UserData');

		nrSceneInfo.addChild(new FBXNodeRecord('Type', PROPERTY_STRING, 'UserData'));
		nrSceneInfo.addChild(new FBXNodeRecord('Version', PROPERTY_INT_32, 100));

		const nrMeta = nrSceneInfo.addChild(new FBXNodeRecord('MetaData'));
		nrMeta.addChild(new FBXNodeRecord('Version', PROPERTY_INT_32, 100));
		for (const key of ['Title', 'Subject', 'Author', 'Keywords', 'Revision', 'Comment'])
			nrMeta.addChild(new FBXNodeRecord(key, PROPERTY_STRING, ''));

		const base = '/' + path.basename(this.out);
		const nrProps = nrSceneInfo.addChild(new FBXNodeRecord('Properties70'));
		nrProps.addChild(new FBXProperty_URL('DocumentUrl', base));
		nrProps.addChild(new FBXProperty_URL('SrcDocumentUrl', base));

		// Format the date as DD-MM-YYYY HH:MM:SS:mmm
		// This differs slighter from the format of the CreationTime root node.
		const now = new Date();
		const timeGMT = util.format(
			'%s/%s/%s %s:%s:%s:%s',
			now.getDate().toString().padStart(2, '0'),
			(now.getUTCMonth() + 1).toString().padStart(2, '0'),
			now.getUTCFullYear(),
			now.getUTCHours(),
			now.getUTCMinutes().toString().padStart(2, '0'),
			now.getUTCSeconds().toString().padStart(2, '0'),
			now.getUTCMilliseconds().toString().padStart(3, '0')
		);

		const compoundLastSaved = {
			ApplicationVendor: { type: 'KString', value: 'wow.export '},
			ApplicationName: { type: 'KString', value: 'wow.export' },
			ApplicationVersion: { type: 'KString', value: nw.App.manifest.version },
			DateTime_GMT: { type: 'DateTime', value: timeGMT }
		};

		nrProps.addChild(...this.createCompound('Original', Object.assign({ FileName: { type: 'KString', value: base } }, compoundLastSaved)));
		nrProps.addChild(...this.createCompound('LastSaved', compoundLastSaved));

		return nrSceneInfo;
	}

	getApplicationString() {
		const manifest = nw.App.manifest;
		return util.format('wow.export v%s %s', manifest.version, manifest.flavour);
	}

	/**
	 * Construct an extended header node.
	 */
	buildExtendedHeaderNode() {
		const header = new FBXNodeRecord('FBXHeaderExtension');
		header.addChild(new FBXNodeRecord('FBXHeaderVersion', PROPERTY_INT_32, 1003));
		header.addChild(new FBXNodeRecord('FBXVersion', PROPERTY_INT_32, FBX_VERSION));
		header.addChild(new FBXNodeRecord('EncryptionType', PROPERTY_INT_32, 0));
		header.addChild(this.buildCreationTimeStampNode());
		header.addChild(new FBXNodeRecord('Creator', PROPERTY_STRING, this.getApplicationString()));
		header.addChild(this.buildSceneInfoNode());

		return header;
	}

	/**
	 * Construct a FileID root node.
	 * This contains as random 16-byte binary value.
	 */
	buildFileIDNode() {
		const buf = Buffer.allocUnsafe(16);

		for (let i = 0; i < 16; i++)
			buf[i] = Math.floor(Math.random() * 255);

		return new FBXNodeRecord('FileId', PROPERTY_BINARY, buf);
	}

	/**
	 * Construct a CreationTime root node.
	 * This contains the file creation date formatted YYYY-MM-DD HH:MM:SS:mmm
	 */
	buildCreationTimeNode() {
		const now = new Date();
		const timeGMT = util.format(
			'%s/%s/%s %s:%s:%s:%s',
			now.getUTCFullYear(),
			(now.getUTCMonth() + 1).toString().padStart(2, '0'),
			now.getDate().toString().padStart(2, '0'),
			now.getUTCHours(),
			now.getUTCMinutes().toString().padStart(2, '0'),
			now.getUTCSeconds().toString().padStart(2, '0'),
			now.getUTCMilliseconds().toString().padStart(3, '0')
		);

		return new FBXNodeRecord('CreationTime', PROPERTY_STRING, timeGMT);
	}

	/**
	 * Construct a Creator root node.
	 * This contains the application information.
	 */
	buildCreatorNode() {
		return new FBXNodeRecord('Creator', PROPERTY_STRING, this.getApplicationString());
	}

	buildGlobalSettingsNode() {
		const node = new FBXNodeRecord('GlobalSettings');
		node.addChild(new FBXNodeRecord('Version', PROPERTY_INT_32, 1000));

		const props = node.addChild(new FBXNodeRecord('Properties70'));

		props.addChild(new FBXProperty_Integer('UpAxis', 1));
		props.addChild(new FBXProperty_Integer('UpAxisSign', 1));
		props.addChild(new FBXProperty_Integer('FrontAxis', 2));
		props.addChild(new FBXProperty_Integer('FrontAxisSign', 1));
		props.addChild(new FBXProperty_Integer('CoordAxis', 0));
		props.addChild(new FBXProperty_Integer('CoordAxisSign', 1));
		props.addChild(new FBXProperty_Integer('OriginalUpAxis', -1));
		props.addChild(new FBXProperty_Integer('OriginalUpAxisSign', 1));
		props.addChild(new FBXProperty_Double('UnitScaleFactor', 1));
		props.addChild(new FBXProperty_Double('OriginalUnitScaleFactor', 1));
		props.addChild(new FBXProperty_ColorRGB('AmbientColor', 0, 0, 0));
		props.addChild(new FBXProperty_KString('DefaultCamera', 'Producer Perspective'));
		props.addChild(new FBXProperty_Enum('TimeMode', 11));
		props.addChild(new FBXProperty_KTime('TimeSpanStart', 0));
		props.addChild(new FBXProperty_KTime('TimeSpanStop', 46186158000));
		props.addChild(new FBXProperty_Double('CustomFrameFrame', 24));

		return node;
	}

	/**
	 * Construct a Documents root node.
	 */
	buildDocumentsNode() {
		const node = new FBXNodeRecord('Documents');
		node.addChild(new FBXNodeRecord('Count', PROPERTY_INT_32, 0));

		return node;
	}

	/**
	 * Construct a Definitions root node.
	 * This contains all of the templates.
	 */
	buildDefinitionsNode() {
		const node = new FBXNodeRecord('Definitions');
		node.addChild(new FBXNodeRecord('Version', PROPERTY_INT_32, 100));
		node.addChild(new FBXNodeRecord('Count', PROPERTY_INT_32, 3)); // Must match template count.

		// Template 1: Global Settings.
		const settings = node.addChild(new FBXNodeRecord('ObjectType'));
		settings.addProperty(PROPERTY_STRING, 'GlobalSettings');
		settings.addChild(new FBXNodeRecord('Count', PROPERTY_INT_32, 1));

		// Template 2: Geometry
		const geo = node.addChild(new FBXNodeRecord('ObjectType'));
		geo.addProperty(PROPERTY_STRING, 'Geometry');
		geo.addChild(new FBXNodeRecord('Count', PROPERTY_INT_32, 1));

		const geoPropsTemplate = geo.addChild(new FBXNodeRecord('PropertyTemplate', PROPERTY_STRING, 'FbxMesh'));
		const geoProps = geoPropsTemplate.addChild(new FBXNodeRecord('Properties70'));

		geoProps.addChild(new FBXProperty_ColorRGB('Color', 0.8, 0.8, 0.8));
		geoProps.addChild(new FBXProperty_Vector3D('BBoxMin', 0, 0, 0));
		geoProps.addChild(new FBXProperty_Vector3D('BBoxMax', 0, 0, 0));
		geoProps.addChild(new FBXProperty_Boolean('Primary Visibility', true));
		geoProps.addChild(new FBXProperty_Boolean('Casts Shadows', true));
		geoProps.addChild(new FBXProperty_Boolean('Receive Shadows', true));

		// Template 3: Model
		const model = node.addChild(new FBXNodeRecord('ObjectType'));
		model.addProperty(PROPERTY_STRING, 'Model');
		model.addChild(new FBXNodeRecord('Count', PROPERTY_INT_32, 1));

		const modelPropsTemplate = model.addChild(new FBXNodeRecord('PropertyTemplate', PROPERTY_STRING, 'FbxNode'));
		const modelProps = modelPropsTemplate.addChild(new FBXNodeRecord('Properties70'));

		modelProps.addChild(new FBXProperty_Enum('QuaternionInterpolate', 0));
		modelProps.addChild(new FBXProperty_Vector3D('RotationOffset', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Vector3D('RotationPivot', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Vector3D('ScalingOffset', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Vector3D('ScalingPivot', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Boolean('TranslationActive', false));
		modelProps.addChild(new FBXProperty_Vector3D('TranslationMin', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Vector3D('TranslationMax', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Boolean('TranslationMinX', false));
		modelProps.addChild(new FBXProperty_Boolean('TranslationMinY', false));
		modelProps.addChild(new FBXProperty_Boolean('TranslationMinZ', false));
		modelProps.addChild(new FBXProperty_Boolean('TranslationMaxX', false));
		modelProps.addChild(new FBXProperty_Boolean('TranslationMaxY', false));
		modelProps.addChild(new FBXProperty_Boolean('TranslationMaxZ', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationOrder', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationSpaceForLimitOnly', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationStiffnessX', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationStiffnessY', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationStiffnessZ', false));
		modelProps.addChild(new FBXProperty_Boolean('AxisLen', false));
		modelProps.addChild(new FBXProperty_Vector3D('PreRotation', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Vector3D('PostRotation', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Boolean('RotationActive', false));
		modelProps.addChild(new FBXProperty_Vector3D('RotationMin', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Vector3D('RotationMax', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Boolean('RotationMinX', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationMinY', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationMinZ', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationMaxX', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationMaxY', false));
		modelProps.addChild(new FBXProperty_Boolean('RotationMaxZ', false));
		modelProps.addChild(new FBXProperty_Enum('InheritType', 0));
		modelProps.addChild(new FBXProperty_Boolean('ScalingActive', false));
		modelProps.addChild(new FBXProperty_Vector3D('ScalingMin', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Vector3D('ScalingMax', 1, 1, 1));
		modelProps.addChild(new FBXProperty_Boolean('ScalingMinX', false));
		modelProps.addChild(new FBXProperty_Boolean('ScalingMinY', false));
		modelProps.addChild(new FBXProperty_Boolean('ScalingMinZ', false));
		modelProps.addChild(new FBXProperty_Boolean('ScalingMaxX', false));
		modelProps.addChild(new FBXProperty_Boolean('ScalingMaxY', false));
		modelProps.addChild(new FBXProperty_Boolean('ScalingMaxZ', false));
		modelProps.addChild(new FBXProperty_Vector3D('GeometricTranslation', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Vector3D('GeometricRotation', 0, 0, 0));
		modelProps.addChild(new FBXProperty_Vector3D('GeometricScaling', 1, 1, 1));
		modelProps.addChild(new FBXProperty_Double('MinDampRangeX', 0));
		modelProps.addChild(new FBXProperty_Double('MinDampRangeY', 0));
		modelProps.addChild(new FBXProperty_Double('MinDampRangeZ', 0));
		modelProps.addChild(new FBXProperty_Double('MaxDampRangeX', 0));
		modelProps.addChild(new FBXProperty_Double('MaxDampRangeY', 0));
		modelProps.addChild(new FBXProperty_Double('MaxDampRangeZ', 0));
		modelProps.addChild(new FBXProperty_Double('MinDampStrengthX', 0));
		modelProps.addChild(new FBXProperty_Double('MinDampStrengthY', 0));
		modelProps.addChild(new FBXProperty_Double('MinDampStrengthZ', 0));
		modelProps.addChild(new FBXProperty_Double('MaxDampStrengthX', 0));
		modelProps.addChild(new FBXProperty_Double('MaxDampStrengthY', 0));
		modelProps.addChild(new FBXProperty_Double('MaxDampStrengthZ', 0));
		modelProps.addChild(new FBXProperty_Double('PreferedAngleX', 0));
		modelProps.addChild(new FBXProperty_Double('PreferedAngleY', 0));
		modelProps.addChild(new FBXProperty_Double('PreferedAngleZ', 0));
		modelProps.addChild(new FBXProperty_Object('LookAtProperty'));
		modelProps.addChild(new FBXProperty_Object('UpVectorProperty'));
		modelProps.addChild(new FBXProperty_Boolean('Show', true));
		modelProps.addChild(new FBXProperty_Boolean('NegativePercentShapeSupport', true));
		modelProps.addChild(new FBXProperty_Integer('DefaultAttributeIndex', -1));
		modelProps.addChild(new FBXProperty_Boolean('Freeze', false));
		modelProps.addChild(new FBXProperty_Boolean('LODBox', false));
		modelProps.addChild(new FBXProperty_LCLVector('Lcl Translation', 0, 0, 0));
		modelProps.addChild(new FBXProperty_LCLVector('Lcl Rotation', 0, 0, 0));
		modelProps.addChild(new FBXProperty_LCLVector('Lcl Scaling', 0, 0, 0));

		const visibility = modelProps.addChild(new FBXNodeRecord('P'));
		visibility.addProperty(PROPERTY_STRING, 'Visibility', 'Visibility', '', 'A');
		visibility.addProperty(PROPERTY_DOUBLE, 1);

		const visibilityInheritance = modelProps.addChild(new FBXNodeRecord('P'));
		visibilityInheritance.addProperty(PROPERTY_STRING, 'Visibility Inheritance', 'Visibility Inheritance', '', '');
		visibilityInheritance.addProperty(PROPERTY_INT_32, 1);

		return node;
	}

	/**
	 * Construct a Takes root node.
	 */
	buildTakesNode() {
		const node = new FBXNodeRecord('Takes');
		node.addChild(new FBXNodeRecord('Current', PROPERTY_STRING, ''));
		return node;
	}

	/**
	 * Construct a Connections root node.
	 */
	buildConnectionsNode() {
		const node = new FBXNodeRecord('Connections');
		// ToDo: Connections.
		return node;
	}

	/**
	 * Construct an Objects root node.
	 */
	buildObjectsNode() {
		const node = new FBXNodeRecord('Objects');

		// Geometry
		//     Property: int64 233233785
		//     Property: string 'Cube.001Geometry'
		//     Property: string 'Mesh'
		//     Node: Properties70
		//     Node: GeometryVersion
		//         Property: int32 124
		//     Node: Vertices
		//         Property: double[] (Compressed)
		//     Node: PolygonVertexIndex
		//         Property: int32[] (Compressed)
		//     Node: Edges
		//         Property: int32[] (Compressed)
		//     Node: LayerElementNormal
		//         Property: int32 0
		//         Node: Version
		//             Property: int32 101
		//         Node: Name
		//             Property: string ''
		//         Node: MappingInformationType
		//             Property: string 'ByPolygonVertex'
		//         Node: ReferenceInformationType
		//             Property: string 'Direct'
		//         Node: Normals
		//             Property: double[] (Compressed)
		//     Node: LayerElementUV
		//         Property: int32 0
		//         Node: Version
		//             Property: int32 101
		//         Node: Name
		//             Property: string 'UVMap'
		//         Node: MappingInformationType
		//             Property: string 'ByPolygonVertex'
		//         Node: ReferenceInformationType
		//             Property: string 'IndexToDirect'
		//         Node: UV
		//             Property: double[] (Compressed)
		//         Node: UVIndex
		//             Property: int32[] (Compressed)
		//     Node: Layer
		//         Property: int32 0
		//         Node: Version
		//             Property: int32 100
		//         Node: LayerElement
		//             Node: Type
		//                 Property: string 'LayerElementNormal'
		//             Node: TypedIndex
		//                 Property: int32 0
		//         Node: LayerElement
		//             Node: Type
		//                 Property: string 'LayerElementUV'
		//             Node: TypedIndex
		//                 Property: int32 0
		// Model
		//     Property: int64 939541264
		//     Property: string CubeModel
		//     Property: string Mesh
		//     Node: Version
		//         Property: int32 232
		//     Node: Properties70
		//         Node: P
		//              Property: string 'Lcl Rotation'
		//              Property: string 'Lcl Rotation'
		//              Property: string ''
		//              Property: string 'A'
		//              Property: double -90.00000933466734
		//              Property: double 0
		//              Property: double 0
		//          Node: P
		//              Property: string 'Lcl Scaling'
		//              Property: string 'Lcl Scaling'
		//              Property: string ''
		//              Property: string 'A'
		//              Property: double 100
		//              Property: double 100
		//              Property: double 100
		//          Node: P
		//              Property: string 'DefaultAttributeIndex'
		//              Property: string 'int'
		//              Property: string 'Integer'
		//              Property: string ''
		//              Property: int32 0
		//          Node: P
		//              Property: string 'InheritType'
		//              Property: string 'enum'
		//              Property: string ''
		//              Property: string ''
		//              Property: int32 1
		//      Node: MultiLayer
		//          Property: int32 0
		//      Node: MultiTake
		//          Property: int32 0
		//      Node: Shading
		//          Property: boolean 1
		//      Node: Culling
		//          Property: string 'CullingOff'


		return node;
	}

	/**
	 * Recursively construct the FBX node tree.
	 * @returns {Set}
	 */
	buildNodeTree() {
		const rootNodes = new Set();

		rootNodes.add(this.buildExtendedHeaderNode());
		rootNodes.add(this.buildFileIDNode());
		rootNodes.add(this.buildCreationTimeNode());
		rootNodes.add(this.buildCreatorNode());
		rootNodes.add(this.buildGlobalSettingsNode());
		rootNodes.add(this.buildDocumentsNode());
		rootNodes.add(new FBXNodeRecord('References'));
		rootNodes.add(this.buildDefinitionsNode());
		rootNodes.add(this.buildObjectsNode());
		rootNodes.add(this.buildConnectionsNode());
		rootNodes.add(this.buildTakesNode());

		return rootNodes;
	}

	/**
	 * Calculate the size of a node tree.
	 * @param {FBXNodeRecord|Set} node 
	 * @returns {number}
	 */
	calculateNodeTreeSize(node) {
		let size = 0;

		if (node instanceof Set) {
			for (const child of node)
				size += this.calculateNodeTreeSize(child);
		} else {
			// endOffset, numProperties, propertyListLen, nameLen, name
			size += 4 + 4 + 4 + 1 + node.name.length;

			// Properties.
			let propertySize = size;
			for (const property of node.properties) {
				const type = property.type;

				size += 1;

				if (type === PROPERTY_STRING) {
					size += 4 + Buffer.byteLength(property.value);
				} else if (type === PROPERTY_BINARY) {
					size += 4 + property.value.byteLength;
				} else if (type.isArray) {
					size += type.size * type.value.length;
				} else {
					size += type.size;
				}
			}

			propertySize = size - propertySize;

			// Child nodes.
			for (const childNode of node.children)
				size += this.calculateNodeTreeSize(childNode);

			// Unknown node list padding.
			if (node.children.size > 0)
				size += 13;

			// Store data sizes for compilation.
			node.size = size;
			node.propertySize = propertySize;
		}

		return size;
	}

	/**
	 * Write a node to the given buffer.
	 * @param {FBXNodeRecord} node 
	 * @param {BufferWrapper} buf 
	 */
	writeNode(node, buf) {
		// Write node record header.
		buf.writeUInt32LE(buf.offset + node.size);
		buf.writeUInt32LE(node.properties.size);
		buf.writeUInt32LE(node.propertySize);
		buf.writeUInt8(Buffer.byteLength(node.name));
		buf.writeString(node.name);

		// Write node record properties.
		for (const property of node.properties) {
			const type = property.type;
			const value = property.value;
		
			buf.writeUInt8(type.code);

			switch (type) {
				case PROPERTY_INT_16: buf.writeInt16LE(value); break;
				case PROPERTY_INT_32: buf.writeInt32LE(value); break;
				case PROPERTY_INT_64: buf.writeInt64LE(BigInt(value)); break;
				case PROPERTY_FLOAT: buf.writeFloatLE(value); break;
				case PROPERTY_DOUBLE: buf.writeDoubleLE(value); break;
				case PROPERTY_BOOLEAN: buf.writeUInt8(value ? 0x01 : 0x00); break;
				case PROPERTY_STRING:
					buf.writeUInt32LE(Buffer.byteLength(value));
					buf.writeString(value);
					break;

				case PROPERTY_BINARY:
					buf.writeUInt32LE(value.byteLength);
					buf.writeBuffer(value);
					break;

				// ToDo: Array support.
			}
		}

		// Write child node list.
		for (const child of node.children)
			this.writeNode(child, buf);

		// Node list padding.
		if (node.children.size > 0) 
			for (let i = 0; i < 13; i++)
				buf.writeUInt8(0x0);
	}

	/**
	 * Write the FBX file.
	 * @param {boolean} overwrite
	 */
	async write(overwrite = true) {
		// If overwriting is disabled, check file existence.
		if (!overwrite && await generics.fileExists(this.out))
			return;

		await generics.createDirectory(path.dirname(this.out));

		const tree = this.buildNodeTree();
		const treeSize = this.calculateNodeTreeSize(tree);

		const buf = BufferWrapper.alloc(treeSize + 27, true);

		// FBX magic is 'Kaydara FBX Binary', two trailing spaces, and a NULL terminator.
		buf.writeString('Kaydara FBX Binary  \x00');

		// The purpose of the following two bytes are unknown, but required.
		buf.writeUInt8(0x1A);
		buf.writeUInt8(0x00);

		// FBX version (7400 = 7.4).
		buf.writeUInt32LE(FBX_VERSION);

		for (const rootNode of tree)
			this.writeNode(rootNode, buf);

		await buf.writeToFile(this.out);
	}
}

module.exports = FBXWriter;