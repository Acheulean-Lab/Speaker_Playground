import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.155.0/build/three.module.js';
import { STLExporter } from './STLExporter.js';
import { OBJLoader } from './OBJLoader.js';

const scene = new THREE.Scene();
// scene.background = new THREE.Color(0xeeedee); // Neutral gray background

// Initial dimensions
function getDimensions() {
  const width = window.innerWidth;
  const height = Math.min(window.innerHeight, 1000);
  return { width, height };
}

const { width, height } = getDimensions();

const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
camera.position.set(0, -.5, 5);
camera.lookAt(0, -.5, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(width, height);
renderer.domElement.style.display = 'block';
renderer.domElement.style.margin = 'auto';
document.getElementById('canvas-wrapper').appendChild(renderer.domElement);

// Single shared OBJ loader for the lifetime of the app
const objLoader = new OBJLoader();



function handleResize() {
  const { width, height } = getDimensions();
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
window.addEventListener('resize', handleResize);
handleResize();

// ENVIRONMENT MAP CODE HERE:
const pmremGenerator = new THREE.PMREMGenerator(renderer);
const envTexture = pmremGenerator.fromScene(new THREE.Scene(), 0.04).texture;
scene.environment = envTexture;

// Enable shadows and tone mapping 
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
// Back-compat across Three.js versions
if ('outputColorSpace' in renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
} else if ('outputEncoding' in renderer) {
  renderer.outputEncoding = THREE.sRGBEncoding;
}

// Shared material for all tubes - defined early so it's available for initial creation //f64a00 c6ff01
function createTubeMaterial() {
  const saturatedColor = new THREE.Color('#FE5D00').convertSRGBToLinear();
  saturatedColor.multiplyScalar(1.4);

    return new THREE.MeshPhysicalMaterial({
    color: saturatedColor,
    metalness: 0.2,
    roughness: 0.75,
    emissiveIntensity: 0.1,
    ior: 1.3, // replaces deprecated reflectivity
    iridescence: true,
    iridescenceIOR: 1.3,
    sheenColor: new THREE.Color(0xffffff), // white sheen
    sheenRoughness: 0.35,
    
    side: THREE.DoubleSide


    
  });

}



// Ground plane
const groundMaterial = new THREE.ShadowMaterial({ color: 0xeeedee, opacity: 0.65 });
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(300, 300),
  groundMaterial
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);





// --- Serpentine Curve functions and variables ---



function createSerpentineCurve(lineLength, yOffset = 0, offset, bendRadius) {
  const points = [];
  // Top line
  points.push(new THREE.Vector3(-lineLength / 2, offset + yOffset, 0));
  points.push(new THREE.Vector3(lineLength / 2, offset + yOffset, 0));

  // Top arc (rightward curve down)
  for (let t = 0; t <= Math.PI; t += Math.PI / 32) {
    if (t === 0 || t === Math.PI) continue;
    points.push(new THREE.Vector3(
      lineLength / 2 + bendRadius * Math.sin(t),
      offset + yOffset - bendRadius * (1 - Math.cos(t)),
      0
    ));
  }

  // Bottom line
  points.push(new THREE.Vector3(lineLength / 2, offset + yOffset - 2 * bendRadius, 0));
  points.push(new THREE.Vector3(-lineLength / 2, offset + yOffset - 2 * bendRadius, 0));

  return new THREE.CatmullRomCurve3(points);
}

function createMiddleConnectingCurve(lineLength, yOffsetTop, yOffsetBottom, offset, bendRadius) {
  const x = offset - lineLength / 2;
  const y0 = offset + yOffsetTop - 2 * bendRadius;
  const y1 = offset + yOffsetBottom;
  const r = Math.abs(y0 - y1) / 2;
  const centerX = x - r;
  const centerY = (y0 + y1) / 2;

  const start = new THREE.Vector3(x, y0, 0);
  const end = new THREE.Vector3(x, y1, 0);

  const arcCurve = new THREE.ArcCurve(centerX, centerY, r, Math.PI / 2, 3 * Math.PI / 2, false);
  const arcPoints = arcCurve.getPoints(32).map(p => new THREE.Vector3(p.x, p.y, 0));

  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(start, arcPoints[0]));
  for (let i = 0; i < arcPoints.length - 1; i++) {
    path.add(new THREE.LineCurve3(arcPoints[i], arcPoints[i + 1]));
  }
  path.add(new THREE.LineCurve3(arcPoints[arcPoints.length - 1], end));

  return path;
}



function createLeftHalfCShape(outerSize, innerSize) {
  // Clamp dimensions to avoid degenerate geometry
  const minSize = 0.05;
  outerSize = Math.max(outerSize, minSize);
  innerSize = Math.max(innerSize, minSize * 0.5);

  const s = outerSize / 2;
  // Corner radius at the exterior
  const r = Math.max(outerSize / 4, minSize * 0.25);
  let innerRadius = Math.max(innerSize / 2, minSize * 0.25);
  
  const shape = new THREE.Shape();
  
  // Create a single continuous "C" shape path that includes the hole boundary
  // Start at the outer edge, go around the shape, then around the hole
  
  // Start at bottom-left corner
  shape.moveTo(-s + r, -s);
  // Bottom edge to center
  shape.lineTo(0, -s);
  // Right edge (split line) going up to hole level
  shape.lineTo(0, -innerRadius);
  // Go around the left half of the hole (clockwise to create a cutout)
  // The hole is centered at (0,0), so we go from the split line around the left half
  shape.absarc(0, 0, innerRadius, -Math.PI/2, Math.PI/2, true);
  // Continue up the split line
  shape.lineTo(0, s);
  // Top edge from center to left
  shape.lineTo(-s + r, s);
  // Left side with rounded corners
  shape.absarc(-s + r, s - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-s, -s + r);
  shape.absarc(-s + r, -s + r, r, Math.PI, 1.5 * Math.PI, false);
  // Close the path back to start
  shape.lineTo(-s + r, -s);
  
  return shape;
}

function createRightHalfCShape(outerSize, innerSize) {
  // Clamp dimensions to avoid degenerate geometry
  const minSize = 0.05;
  outerSize = Math.max(outerSize, minSize);
  innerSize = Math.max(innerSize, minSize * 0.5);

  const s = outerSize / 2;
  const r = Math.max(outerSize / 4, minSize * 0.25);
  let innerRadius = Math.max(innerSize / 2, minSize * 0.25);
  
  const shape = new THREE.Shape();
  
  // Create a single continuous "C" shape path that includes the hole boundary
  // This is the mirror of the left half
  
  // Start at bottom-center
  shape.moveTo(0, -s);
  // Bottom edge to right
  shape.lineTo(s - r, -s);
  // Right side with rounded corners
  shape.absarc(s - r, -s + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(s, s - r);
  shape.absarc(s - r, s - r, r, 0, Math.PI / 2, false);
  // Top edge from right to center
  shape.lineTo(0, s);
  // Left edge (split line) going down to hole level
  shape.lineTo(0, innerRadius);
  // Go around the right half of the hole (clockwise to create a cutout)
  // The hole is centered at (0,0), so we go from the split line around the right half
  shape.absarc(0, 0, innerRadius, Math.PI/2, 3*Math.PI/2, true);
  // Continue down the split line
  shape.lineTo(0, -s);
  
  return shape;
}

function createLeftHalfTube(curve, faceSize, holeSize, material) {
  const leftShape = createLeftHalfCShape(faceSize, holeSize);
  const extrudeSettings = {
    steps: 120,
    extrudePath: curve,
    bevelEnabled: false,
    capStart: false,
    capEnd: false,
  };
  const tubeGeometry = new THREE.ExtrudeGeometry(leftShape, extrudeSettings);
  const tube = new THREE.Mesh(tubeGeometry, material);
  tube.castShadow = true; 
  return { tube };
}

function createRightHalfTube(curve, faceSize, holeSize, material) {
  const rightShape = createRightHalfCShape(faceSize, holeSize);
  const extrudeSettings = {
    steps: 120,
    extrudePath: curve,
    capStart: false,
    capEnd: false,
    bevelEnabled: false
  };
  const tubeGeometry = new THREE.ExtrudeGeometry(rightShape, extrudeSettings);
  const tube = new THREE.Mesh(tubeGeometry, material);
  tube.castShadow = true; // <-- Add this line
  return { tube };
}



const slider = document.getElementById('line-length-slider');
// const faceSlider = document.getElementById('face-size-slider');
const holeSlider = document.getElementById('hole-size-slider');

let slidervalue = 100;
if (slider) {
  const raw = slider.value || slider.dataset?.original;
  const num = Number(raw);
  slidervalue = Number.isFinite(num) && num > 0 ? num : 100;
}

let hzlength = 8575 / slidervalue;

let holeSize = 0.5;
if (holeSlider) {
  const rawHole = holeSlider.value || holeSlider.dataset?.original;
  const numHole = Number(rawHole);
  holeSize = Number.isFinite(numHole) && numHole > 0 ? numHole : 0.5;
}

let faceSize = holeSize * 1.4;

function getLineSegmentLength(hzlength, bendRadius) {
  // Calculate actual arc length based on curve geometry
  const arcLength = Math.PI * bendRadius;
  const totalArcLength = 3 * arcLength; // 3 arcs per complete path
  const straightLineLength = hzlength - totalArcLength;
  return straightLineLength / 4; // 4 straight segments total
}

function getshortSegmentLength(straightLineLength) {
  const linelen = straightLineLength / 4;
  return shorty = linelen - arcLength; 

}


const group = new THREE.Group();
scene.add(group);

let tube1Left, tube1Right, tube2Left, tube2Right, middleTubeLeft, middleTubeRight;
let cap1, cap2;

// Cache for cap template and tubes for disposal
let capTemplate = null;
let capLoadPromise = null;
const tubes = [];

function loadCapTemplate() {
  if (capTemplate) return Promise.resolve(capTemplate);
  if (capLoadPromise) return capLoadPromise;
  capLoadPromise = new Promise((resolve, reject) => {
    objLoader.load(
      './WiggleCode/TL_Cap.obj',
      (obj) => {
        capTemplate = obj;
        resolve(capTemplate);
      },
      undefined,
      (err) => {
        console.error('OBJ load error:', err);
        reject(err);
      }
    );
  });
  return capLoadPromise;
}

function detachCapsFromGroup() {
  if (cap1 && cap1.parent === group) group.remove(cap1);
  if (cap2 && cap2.parent === group) group.remove(cap2);
}

function disposeMesh(mesh) {
  if (!mesh) return;
  if (mesh.geometry) mesh.geometry.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((m) => m && m.dispose && m.dispose());
}

function disposeExistingTubes() {
  // Remove and dispose only tube meshes; leave caps intact
  while (tubes.length > 0) {
    const mesh = tubes.pop();
    if (mesh && mesh.parent === group) group.remove(mesh);
    disposeMesh(mesh);
  }
}

function ensureCaps(lineSegmentLength, verticalGap, holeSize, tubeMaterial) {
  if (!capTemplate) return; // Will be handled once template loads

  if (!cap1) {
    cap1 = capTemplate.clone(true);
    cap1.userData.isCap = true;
  }
  if (!cap2) {
    cap2 = capTemplate.clone(true);
    cap2.userData.isCap = true;
  }

  // Update materials to match current tube material
  [cap1, cap2].forEach((cap) => {
    cap.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.material = tubeMaterial;
        child.material.side = THREE.DoubleSide;
      }
    });
  });

  // Set transforms
  const offsetX = -lineSegmentLength / 2;
  const offsety = verticalGap / 2;
  const offsetZ = 0;
  cap1.position.set(offsetX, offsety, offsetZ);
  cap1.rotation.x = Math.PI / 2;
  cap1.rotation.z = Math.PI / 2;
  cap1.scale.setScalar(0.2 * holeSize);

  const offsety2 = -verticalGap; // preserve original logic
  cap2.position.set(offsetX, offsety2, offsetZ);
  cap2.rotation.x = Math.PI / 2;
  cap2.rotation.z = Math.PI / 2;
  cap2.scale.setScalar(0.2 * holeSize);

  // Add to group if not already present
  if (cap1.parent !== group) group.add(cap1);
  if (cap2.parent !== group) group.add(cap2);
}

function sanitizeParameters(rawHzLength, rawFaceSize, rawHoleSize) {
  let cleanHz = Number(rawHzLength);
  let cleanHole = Number(rawHoleSize);
  let cleanFace = Number(rawFaceSize);

  if (!Number.isFinite(cleanHz) || cleanHz <= 0) cleanHz = 85.75;
  if (!Number.isFinite(cleanHole) || cleanHole <= 0) cleanHole = 0.5;
  if (!Number.isFinite(cleanFace) || cleanFace <= 0) cleanFace = cleanHole * 1.4;

  // Ensure face is larger than hole
  if (cleanFace <= cleanHole * 1.1) cleanFace = cleanHole * 1.4;

  return { hz: cleanHz, face: cleanFace, hole: cleanHole };
}




function addSerpentineCopies(hzlength, faceSize, holeSize) {
  const { hz, face, hole } = sanitizeParameters(hzlength, faceSize, holeSize);
  hzlength = hz; faceSize = face; holeSize = hole;
  
  // Desired gap between the actual tube surfaces (not centerlines)
  const desiredSurfaceGap = 1;
  
  // The bend radius needs to account for the tube thickness
  // Gap between centerlines = surface gap + tube thickness
  const bendRadius = (desiredSurfaceGap + faceSize) / 2;
  
  const height = 2 * faceSize;
  const offset = 0; // Keep centered
  
  // Vertical separation between S-curves also needs to account for tube thickness
  const verticalGap = (2 * bendRadius) + desiredSurfaceGap + faceSize;
  
  // Detach caps before disposing tubes so they don't reference disposed materials
  detachCapsFromGroup();
  // Remove previously created tubes only (keep caps alive)
  disposeExistingTubes();

  const lineSegmentLength = getLineSegmentLength(hzlength, bendRadius);
  if (lineSegmentLength <= 0) return;

  // Create curves (same as before)
  const curve1 = createSerpentineCurve(lineSegmentLength, verticalGap / 2, offset, bendRadius);
  const curve2 = createSerpentineCurve(lineSegmentLength, -verticalGap / 2, offset, bendRadius);
  const middleCurve = createMiddleConnectingCurve(lineSegmentLength, verticalGap / 2, -verticalGap / 2, offset, bendRadius);

  // Create shared material
  const tubeMaterial = createTubeMaterial();
  // Ensure caps are loaded once and then reused
  if (capTemplate) {
    ensureCaps(lineSegmentLength, verticalGap, holeSize, tubeMaterial);
  } else {
    loadCapTemplate()
      .then(() => ensureCaps(lineSegmentLength, verticalGap, holeSize, tubeMaterial))
      .catch(() => {/* ignore load errors already logged */});
  }
  
  // Create both left and right halves
  tube1Left = createLeftHalfTube(curve1, faceSize, holeSize, tubeMaterial).tube;
  tube1Right = createRightHalfTube(curve1, faceSize, holeSize, tubeMaterial).tube;
  tube2Left = createLeftHalfTube(curve2, faceSize, holeSize, tubeMaterial).tube;
  tube2Right = createRightHalfTube(curve2, faceSize, holeSize, tubeMaterial).tube;
  middleTubeLeft = createLeftHalfTube(middleCurve, faceSize, holeSize, tubeMaterial).tube;
  middleTubeRight = createRightHalfTube(middleCurve, faceSize, holeSize, tubeMaterial).tube;

  // Add both halves to the group
  group.add(tube1Left);
  group.add(tube1Right);
  group.add(tube2Left);
  group.add(tube2Right);
  group.add(middleTubeLeft);
  group.add(middleTubeRight);

  // Track tubes for future disposal
  tubes.push(
    tube1Left,
    tube1Right,
    tube2Left,
    tube2Right,
    middleTubeLeft,
    middleTubeRight
  );

  const oldAxes = scene.getObjectByName('originAxes');
  if (oldAxes) {
    scene.remove(oldAxes);
    oldAxes.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  
  // Create new axes with updated positioning and tick scaling
  const newAxes = createOriginAxes(faceSize, hzlength);
  newAxes.name = 'originAxes';
  scene.add(newAxes);
}
addSerpentineCopies(hzlength, faceSize, holeSize);
adjustCameraForScale(faceSize); // Add this line

// Force an immediate update to apply the new material
updateSerpentine(hzlength, faceSize, holeSize);



// Studio lighting setup
function createStudioLighting() {
  // Key light (main directional light from top-front-right)
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.91);
  keyLight.position.set(6, 18, -10); // Move right and lower
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;  // Higher resolution for sharper shadows
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 400;
  keyLight.shadow.camera.left = -280;
  keyLight.shadow.camera.right = 180;
  keyLight.shadow.camera.top = 180;
  keyLight.shadow.camera.bottom = -180;
  keyLight.shadow.radius = 12; // Increase blur
  scene.add(keyLight);

  

  // Fill light (softer light from opposite side)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.74);
  fillLight.position.set(-10, 10, 5);
  scene.add(fillLight);

  // Rim light (back light for edge definition)
  const rimLight = new THREE.DirectionalLight(0xffffff, 0.50);
  rimLight.position.set(-5, 5, -15);
  scene.add(rimLight);

  // Ambient light (very subtle overall illumination)
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  // Optional: Add hemisphere light for more natural sky/ground lighting
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0.13);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);
}

// Call the studio lighting setup
createStudioLighting();



// Enable shadows in renderer
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// Create axes that scale with the object bounding box
function createOriginAxes(faceSize, hzlength) {
  const axisGroup = new THREE.Group();
  
  // Calculate object dimensions for positioning
  const desiredSurfaceGap = 1;
  const bendRadius = (desiredSurfaceGap + faceSize) / 2;
  const verticalGap = (2 * bendRadius) + desiredSurfaceGap + faceSize;
  const lineSegmentLength = getLineSegmentLength(hzlength, bendRadius);
  
  // Calculate actual object bounds based on curve positions
  const topCurveY = verticalGap / 2; // Top curve center
  const bottomCurveY = -verticalGap / 2; // Bottom curve center
  const curveDrop = 2 * bendRadius; // How much curves drop from their center
  
  // Actual vertical bounds
  const actualTopY = topCurveY + faceSize/2; // Top of top curve
  const actualBottomY = bottomCurveY - curveDrop - faceSize/2; // Bottom of bottom curve
  const actualHeight = actualTopY - actualBottomY;
  
  // Horizontal bounds
  const objectWidth = lineSegmentLength + (2 * bendRadius) + faceSize;
  
  // Calculate object height (same as in addSerpentineCopies)
  const objectHeight = verticalGap + (2 * bendRadius) + faceSize;
  
  // Set offset to exactly half the height of the serpentine curve
  const offset = objectHeight / 4;
  
  // Calculate the center of the object
  const objectCenterX = 0; // Object is centered horizontally
  const objectCenterY = (actualTopY + actualBottomY) / 2;
  
  // Calculate axis size to encompass the object plus the offset
  let finalAxisSize = objectHeight + (offset * 2); // object height + offset on top and bottom
  // Make axis shorter by reducing the size
  finalAxisSize = finalAxisSize * 0.8; // Reduce to 80% of calculated size
  
  // Position axes to form a square centered on the object
  const axisStartX = objectCenterX - finalAxisSize/2;
  const axisStartY = objectCenterY - finalAxisSize/2;
  
  const darkerGrey = 0x4c4c4c;
  const lightGrey = 0xcccccc00;
  
  // X-axis (horizontal line)
  const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(axisStartX, axisStartY, 0),
    new THREE.Vector3(axisStartX + finalAxisSize, axisStartY, 0)
  ]);
  const xAxisMaterial = new THREE.LineBasicMaterial({ 
    color: darkerGrey,
    opacity: 0.7,
    transparent: true
  });
  const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial);
  axisGroup.add(xAxis);
  
  // Y-axis (vertical line)
  const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(axisStartX, axisStartY, 0),
    new THREE.Vector3(axisStartX, axisStartY + finalAxisSize, 0)
  ]);
  const yAxisMaterial = new THREE.LineBasicMaterial({ 
    color: darkerGrey,
    opacity: 0.7,
    transparent: true
  });
  const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial);
  axisGroup.add(yAxis);
  
  // Calculate tick spacing based on axis size
  let tickInterval = 1;
  let majorInterval = 5;
  
  // Adjust tick intervals based on axis size for readability
  if (finalAxisSize > 50) {
    tickInterval = 2;
    majorInterval = 10;
  } else if (finalAxisSize > 100) {
    tickInterval = 5;
    majorInterval = 25;
  } else if (finalAxisSize < 10) {
    tickInterval = 0.5;
    majorInterval = 2.5;
  }
  
  // Dynamic tick length based on axis size
  const tickLength = finalAxisSize * 0.03; // 3% of axis size
  
  // X-axis tick marks
  for (let i = tickInterval; i <= finalAxisSize; i += tickInterval) {
    const isMajor = (i % majorInterval) < 0.01; // Account for floating point precision
    const material = new THREE.LineBasicMaterial({ 
      color: isMajor ? darkerGrey : lightGrey,
      opacity: isMajor ? 0.7 : 0.4,
      transparent: true
    });
    
    const tickGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(axisStartX + i, axisStartY, 0),
      new THREE.Vector3(axisStartX + i, axisStartY - tickLength, 0)
    ]);
    
    const tick = new THREE.Line(tickGeometry, material);
    axisGroup.add(tick);
  }
  
  // Y-axis tick marks
  for (let i = tickInterval; i <= finalAxisSize; i += tickInterval) {
    const isMajor = (i % majorInterval) < 0.01; // Account for floating point precision
    const material = new THREE.LineBasicMaterial({ 
      color: isMajor ? darkerGrey : lightGrey,
      opacity: isMajor ? 0.7 : 0.4,
      transparent: true
    });
    
    const tickGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(axisStartX, axisStartY + i, 0),
      new THREE.Vector3(axisStartX - tickLength, axisStartY + i, 0)
    ]);
    
    const tick = new THREE.Line(tickGeometry, material);
    axisGroup.add(tick);
  }
  
  return axisGroup;
}

function getSerpentineBottomY(faceSize, hzlength) {
  const desiredSurfaceGap = 1;
  const bendRadius = (desiredSurfaceGap + faceSize) / 2;
  const verticalGap = (2 * bendRadius) + desiredSurfaceGap + faceSize;
  const topCurveY = verticalGap / 2; // Top curve center
  const bottomCurveY = -verticalGap / 2; // Bottom curve center
  const curveDrop = 2 * bendRadius; // How much curves drop from their center
  // Actual vertical bounds
  const actualBottomY = bottomCurveY - curveDrop - faceSize / 2; // Bottom of bottom curve
  return actualBottomY;
}


const exportBtn = document.getElementById('export-stl-btn');
if (exportBtn) {
  exportBtn.addEventListener('click', () => {
    const exporter = new STLExporter();
    
    // Export left half
    const leftGroup = new THREE.Group();
    if (tube1Left) leftGroup.add(tube1Left.clone());
    if (tube2Left) leftGroup.add(tube2Left.clone());
    if (middleTubeLeft) leftGroup.add(middleTubeLeft.clone());
    
    // Export right half
    const rightGroup = new THREE.Group();
    if (tube1Right) rightGroup.add(tube1Right.clone());
    if (tube2Right) rightGroup.add(tube2Right.clone());
    if (middleTubeRight) rightGroup.add(middleTubeRight.clone());

    // Export cap1 as a separate body
    const cap1Group = new THREE.Group();
    if (cap1) cap1Group.add(cap1.clone());

    // Export cap2 as a separate body
    const cap2Group = new THREE.Group();
    if (cap2) cap2Group.add(cap2.clone());
    
    // ----------------- Export Functions -----------------

    // Left Half Export
    if (leftGroup.children.length > 0) {
      const leftStlData = exporter.parse(leftGroup, { binary: true });
      const leftBlob = new Blob([leftStlData], { type: 'application/octet-stream' });
      const leftUrl = URL.createObjectURL(leftBlob);
      const leftLink = document.createElement('a');
      leftLink.href = leftUrl;
      leftLink.download = 'handaxe_left_half.stl';
      document.body.appendChild(leftLink);
      leftLink.click();
      document.body.removeChild(leftLink);
      URL.revokeObjectURL(leftUrl);
    }
    
    // Right Half Export
    if (rightGroup.children.length > 0) {
      const rightStlData = exporter.parse(rightGroup, { binary: true });
      const rightBlob = new Blob([rightStlData], { type: 'application/octet-stream' });
      const rightUrl = URL.createObjectURL(rightBlob);
      const rightLink = document.createElement('a');
      rightLink.href = rightUrl;
      rightLink.download = 'handaxe_right_half.stl';
      document.body.appendChild(rightLink);
      rightLink.click();
      document.body.removeChild(rightLink);
      URL.revokeObjectURL(rightUrl);
    }

    // Cap 1 Export
    if (cap1Group.children.length > 0) {
        const cap1StlData = exporter.parse(cap1Group, { binary: true });
        const cap1Blob = new Blob([cap1StlData], { type: 'application/octet-stream' });
        const cap1Url = URL.createObjectURL(cap1Blob);
        const cap1Link = document.createElement('a');
        cap1Link.href = cap1Url;
        cap1Link.download = 'handaxe_cap1.stl';
        document.body.appendChild(cap1Link);
        cap1Link.click();
        document.body.removeChild(cap1Link);
        URL.revokeObjectURL(cap1Url);
    }

    // Cap 2 Export
    if (cap2Group.children.length > 0) {
        const cap2StlData = exporter.parse(cap2Group, { binary: true });
        const cap2Blob = new Blob([cap2StlData], { type: 'application/octet-stream' });
        const cap2Url = URL.createObjectURL(cap2Blob);
        const cap2Link = document.createElement('a');
        cap2Link.href = cap2Url;
        cap2Link.download = 'handaxe_cap2.stl';
        document.body.appendChild(cap2Link);
        cap2Link.click();
        document.body.removeChild(cap2Link);
        URL.revokeObjectURL(cap2Url);
    }
  });
}

function adjustCameraForScale(faceSize) {
  // Calculate the approximate bounds of the object based on face size and bend radius
  const desiredSurfaceGap = 4;
  const bendRadius = (desiredSurfaceGap + faceSize) / 2;
  const verticalGap = (2 * bendRadius) + desiredSurfaceGap + faceSize;
  
  // Estimate the total object height and width
  const objectHeight = verticalGap + (2 * bendRadius) + faceSize;
  const objectWidth = Math.max(20, faceSize * 4); // Rough estimate based on line length
  
  // Calculate camera distance to maintain consistent apparent size
  const maxDimension = Math.max(objectHeight, objectWidth);
  const baseCameraDistance = 14; // Your current camera distance
  const scaleFactor = maxDimension / 12; // Adjust this divisor to fine-tune
  
  camera.position.setLength(baseCameraDistance * scaleFactor);
}

function updateSerpentine(hzlength, faceSize, holeSize) {
  addSerpentineCopies(hzlength, faceSize, holeSize);
  adjustCameraForScale(faceSize);
  // Set ground position
  const bottomY = getSerpentineBottomY(faceSize, hzlength);
  ground.position.y = bottomY - 0.6*faceSize;
  renderer.render(scene, camera);
  console.log('Slider value:', slidervalue, '→ hzlength:', hzlength);
}

if (slider && holeSlider) {
  slider.addEventListener('input', (e) => {
    slidervalue = Number(e.target.value);
    hzlength = 8575 / slidervalue;
    updateSerpentine(hzlength, faceSize, holeSize);
  });
  // faceSlider.addEventListener('input', (e) => {
  //   faceSize = Number(e.target.value);
  //   updateSerpentine(hzlength, faceSize, holeSize);
  // });
  holeSlider.addEventListener('input', (e) => {
    holeSize = Number(e.target.value);
    faceSize = holeSize * 1.4;
    updateSerpentine(hzlength, faceSize, holeSize);
  });
}

const clock = new THREE.Clock();
const ROTATION_SPEED_RAD_PER_SEC = 0.6; // ~0.01 per frame at 60fps

function animate() {
  requestAnimationFrame(animate);
  const deltaSeconds = clock.getDelta();
  group.rotation.y += ROTATION_SPEED_RAD_PER_SEC * deltaSeconds;
  renderer.render(scene, camera);
}
animate();
