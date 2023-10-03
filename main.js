import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { FFmpeg } from '@ffmpeg/ffmpeg';
//import { FS } from '@ffmpeg/types';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
// import { CanvasCapture } from 'canvas-capture';
import initJank from "./jank.js"

// ------------------------------Jank init--------------------------------- //
initJank();


// ------------------------------FFmpeg init------------------------------- //
const ffmpeg = new FFmpeg();
const baseURL = 'https://unpkg.com/@ffmpeg/core-mt@0.12.2/dist/esm';
console.log("ffmpeg loading");
await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    workerURL: await toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, "text/javascript"),
});
ffmpeg.on("log", ({ type, message }) => { console.log(message) });
ffmpeg.on("progress", console.log);
console.log("ffmpeg loaded");


// ------------------------------3.js test scene--------------------------- //
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeeeeee);
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0x888888);
scene.add(ambient);

const light = new THREE.PointLight(0xd5deff, 100);
light.castShadow = true;
light.position.x = 5;
light.position.y = 0.5;

light.shadow.mapSize.width = 4096;
light.shadow.mapSize.height = 4096;
light.shadow.camera.near = 0.1;
light.shadow.camera.far = 50;

scene.add(light);

const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
const cubeMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
cube.castShadow = true;
cube.receiveShadow = true;
cube.position.y = 0.5;
scene.add(cube);

const sphereGeometry = new THREE.SphereGeometry(0.3, 64, 32);
const sphereMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
sphere.castShadow = true;
sphere.receiveShadow = true;
scene.add(sphere);

const sphereOrbitHeight = 3;
const sphereOrbitSpeed = 0.6;
sphere.position.add(cube.position);
sphere.position.add(new THREE.Vector3(0, 0, sphereOrbitHeight));

const octGeometry = new THREE.OctahedronGeometry(0.1);
const octMaterial = new THREE.MeshPhongMaterial({ color: 0x0000ff });
const oct = new THREE.Mesh(octGeometry, octMaterial);
oct.castShadow = true;
oct.receiveShadow = true;
scene.add(oct);

const octOrbitHeight = 1.0;
const octOrbitSpeed = 3.0;
oct.position.add(sphere.position);
oct.position.add(new THREE.Vector3(0, 0, octOrbitHeight));

const controls = new OrbitControls(camera, renderer.domElement);
controls.maxPolarAngle = 0.9 * Math.PI / 2;

const clock = new THREE.Clock();

let baseRenderTarget = new THREE.WebGLRenderTarget();
baseRenderTarget.setSize(window.innerWidth, window.innerHeight);
let copyRenderTarget = new THREE.WebGLRenderTarget(720, 720);

const copyMaterial = new THREE.ShaderMaterial(CopyShader);
copyMaterial.uniforms.tDiffuse.value = baseRenderTarget.texture;

const fsq = new FullScreenQuad(copyMaterial);

const recordingCanvas = document.createElement('canvas');
recordingCanvas.width = 720;
recordingCanvas.height = 720;
recordingCanvas.style.display = 'hidden';
document.body.appendChild(recordingCanvas);


// ---------------------Recording interface logic--------------------- //
let recording = false;
let saving = false;
let recordingStart = 0;

const frames = []
const frameTimes = []

function startVideoRecording() {
    document.getElementById('record_button').innerText = "Stop recording";
    frames.length = 0;
    frameTimes.length = 0;
    recordingStart = clock.getElapsedTime();
}

function stopVideoRecording() {
    document.getElementById('record_button').innerText = "Start recording";
}

function setVideoRecording() {
    if (!recording) {
        stopVideoRecording();
    } else {
        startVideoRecording();
    }
}

function toggleRecordingState() {
    if (recording) recording = false;
    else if (!saving) recording = true;
}

document.getElementById('record_button').addEventListener("click", toggleRecordingState, false);
document.getElementById('record_button').addEventListener("click", setVideoRecording, false);

async function JpegURLToFS(url, index) {
    let data = dataUriToBytes(url);
    await ffmpeg.writeFile(`${index}.jpg`, data);
}

async function RGBAToJpegFS(array, index) {
    let data = array.slice();
    await ffmpeg.writeFile(`${index}.raw`, data);
    await ffmpeg.exec(["-f", "rawvideo", "-pix_fmt", "rgba", "-s", "720x720", "-i", `${index}.raw`, "-vcodec", "mjpeg", "-pix_fmt", "yuvj420p", `${index}.jpg`]);
}

function imgDataToCanvas() {
    renderer.setRenderTarget(baseRenderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(copyRenderTarget);
    fsq.render(renderer);
    let buffer = new Uint8ClampedArray(720 * 720 * 4);
    renderer.readRenderTargetPixels(copyRenderTarget, 0, 0, 720, 720, buffer);
    let imgData = new ImageData(buffer, 720, 720);
    recordingCanvas.getContext("2d").putImageData(imgData, 0, 0);
    return recordingCanvas.toDataURL('image/jpeg');
}

async function jpegsMP3ToMP4(framerate, outputFilename) {
    await ffmpeg.exec(["-r", framerate.toString(), "-f", "image2", "-i", "%d.jpg", "-i", "audio.mp3", "-vcodec", "libx264", "-acodec", "copy", "-pix_fmt", "yuv420p", outputFilename]);
}

var recordingMethod = imgDataToCanvas;
var frameProcessing = JpegURLToFS;
var videoProcessing = jpegsMP3ToMP4;

var audioBlob;

function initAudio(stream) {
    const mediaRecorder = new MediaRecorder(stream);
    const data = [];

    mediaRecorder.ondataavailable = (event) => {
        data.push(event.data);
    };

    mediaRecorder.onstop = (event) => {
        audioBlob = data[0];
    }

    function setAudioRecording() {
        if (recording) mediaRecorder.start();
        else mediaRecorder.stop();
    }

    document.getElementById('record_button').addEventListener("click", setAudioRecording, false);
}

function audioFail(err) {
    console.log(err);
}

navigator.getUserMedia({ audio: true }, initAudio, audioFail);

async function webmBlobToMP3FS() {
    let data = await audioBlob.arrayBuffer();
    await ffmpeg.writeFile("audio.webm", new Uint8Array(data));
    await ffmpeg.exec(["-i", "audio.webm", "-vn", "-ab", "128k", "-ar", "44100", "-acodec", "libmp3lame", "audio.mp3"]);
}

var audioProcessing = webmBlobToMP3FS;

async function saveRecording(event) {
    saving = true;
    let framerate = event.currentTarget.framerate;
    console.log("generating frames at " + framerate + "fps");
    let urlCreator = window.URL || window.webkitURL;
    let rateDuration = 1.0 / framerate;
    let frameCount = 0;
    let i = 0;
    let duration = 0;
    for (let i = 0; i < frameTimes.length; i++) {
        while (frameTimes[i] > duration) {
            await frameProcessing(frames[i], frameCount);
            frameCount += 1;
            duration += rateDuration;
        }
    }

    console.log("processing audio");
    await audioProcessing();
    console.log("processing video");
    await videoProcessing(framerate, "out.mp4");
    console.log("reading video data");
    const video_data = await ffmpeg.readFile("out.mp4");
    console.log("updating video link");
    document.getElementById('video_link').href = URL.createObjectURL(new Blob([video_data], { type: 'video/mp4' }));
    document.getElementById('video_link').innerText = "Latest recording here";
    saving = false;
}

document.getElementById('save_button').addEventListener("click", saveRecording, false);
document.getElementById('save_button').framerate = 60;

let lastElapsed = 0;

function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    let elapsed = clock.getElapsedTime();
    let delta = elapsed - lastElapsed;

    const sphereDistance = new THREE.Vector3().subVectors(sphere.position, cube.position);
    const sphereMovement = new THREE.Vector3().crossVectors(sphereDistance, new THREE.Vector3(0, 1, 0));
    sphereMovement.setLength(sphereOrbitSpeed * delta);
    sphereDistance.add(sphereMovement);
    sphereDistance.setLength(sphereOrbitHeight);
    sphere.position.addVectors(cube.position, sphereDistance);

    const octDistance = new THREE.Vector3().subVectors(oct.position, sphere.position);
    const octMovement = new THREE.Vector3().crossVectors(octDistance, new THREE.Vector3(0, 1, 0));
    octMovement.setLength(octOrbitSpeed * delta);
    octDistance.add(octMovement);
    octDistance.setLength(octOrbitHeight);
    oct.position.addVectors(sphere.position, octDistance);

    cube.rotation.x += 0.5 * delta;
    cube.rotation.y += 0.5 * delta;
    cube.rotation.z += 0.5 * delta;

    oct.rotation.x += 0.5 * delta;
    oct.rotation.y += 0.5 * delta;
    oct.rotation.z += 0.5 * delta;

    renderer.setRenderTarget(null);
    renderer.render(scene, camera);

    if (recording) {
        frames.push(recordingMethod());
        frameTimes.push(elapsed - recordingStart);
    }

    lastElapsed = elapsed;
}

// -------------------------------------- HELPERS FROM CONNOR ------------------------------------------ //

export const base64ToBytes = (dataString) => {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    const byteString = atob(dataString);
    const l = byteString.length;

    const data = new Uint8Array(new ArrayBuffer(l));
    for (let i = 0; i < l; i++) {
        data[i] = byteString.charCodeAt(i);
    }

    return data;
};

export const dataUriToBytes = (dataUri) => {
    const split = dataUri.split(",")[1];
    return base64ToBytes(split);
};

window.onresize = function () {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
    baseRenderTarget.setSize(window.innerWidth, window.innerHeight);
};

animate();
