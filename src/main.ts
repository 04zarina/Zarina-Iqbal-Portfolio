import * as THREE from 'three';
import { AppRenderer } from './core/renderer';
import { RenderLoop } from './core/loop';
import { themeManager } from './world/theme';
import { FollowCamera } from './world/camera/followCamera';
import { FocusCameraManager } from './world/camera/focusCamera';
import { Avatar } from './world/avatar/avatar';
import { AvatarController } from './world/avatar/controller';
import { Companion } from './world/companion/companion';
import { SceneManager } from './world/sceneManager';
import { sparkleSystem } from './world/fx/sparkles';
import { jellyController } from './world/fx/jelly';
import { eventBus } from './core/events';
import { store } from './core/store';

// UI Overlays
import { HUD } from './ui/hud';
import { LoadingScreen } from './ui/loading';
import { ProjectCardOverlay } from './ui/projectCard';
import { ChatPanel } from './ui/chat';
import { ContactFormOverlay } from './ui/contactForm';
import { JournalOverlay } from './ui/journal';
import { PauseMenuOverlay } from './ui/pauseMenu';
import { TVVideoOverlay } from './ui/tvOverlay';
import { AboutOverlay } from './ui/aboutOverlay';
import { EducationOverlay } from './ui/educationOverlay';
import { ResumeOverlay } from './ui/resumeOverlay';
import { toastManager } from './ui/toast';

async function bootstrap() {
  // 1. Three.js Scene & Lights
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(themeManager.dayBg, 12, 38);

  const ambientLight = new THREE.AmbientLight(0xFFE9A3, 1.2);
  const dirLight = new THREE.DirectionalLight(0xFFFAF0, 1.4);
  dirLight.position.set(6, 12, 8);
  scene.add(ambientLight, dirLight);

  themeManager.attachScene(scene, ambientLight, dirLight);

  // 2. Renderer & Loop
  const appRenderer = new AppRenderer();
  const loop = new RenderLoop();

  // 3. Cameras
  const followCamera = new FollowCamera();
  const focusCamera = new FocusCameraManager(followCamera.camera);

  // 4. Avatar & Controller (Chibi Girl)
  const avatar = new Avatar();
  scene.add(avatar.group);
  const controller = new AvatarController(avatar);

  // 5. Loading Screen
  const loading = new LoadingScreen(() => {
    // Start in dusk/night mode and play waking-up sequence!
    const bedPos = new THREE.Vector3(-3.4, 0.52, -1.9);
    const outPos = new THREE.Vector3(-1.8, 0, -1.8);

    toastManager.show('Yaaawn... 🥱 Good morning! Waking up...');
    avatar.wakeUp(bedPos, outPos, () => {
      store.set('inputLocked', false);
      store.set('isWakingUp', false);
      store.set('isSleeping', false);
      toastManager.show('Ready to explore! Use WASD or joystick. Need help? Click "Ask Mochi" anytime! 🐾');
    });
  });
  loading.setProgress(30);

  // Joystick event bridge
  eventBus.on('joystick:move', (data: { x: number; y: number }) => {
    controller.setJoystick(data.x, data.y);
  });

  // 6. Companion Cat (Loads Sketchfab Red Panda from public/models/companion)
  const companion = new Companion();
  scene.add(companion.group);
  loading.setProgress(75);

  // Companion Summoning
  eventBus.on('companion:summon', () => {
    companion.summonToAvatar(avatar.position, avatar.rotationY);
  });

  // 7. FX Systems
  scene.add(sparkleSystem.group);

  // 8. Scene & Room Manager
  const sceneManager = new SceneManager(scene, avatar, followCamera);
  await sceneManager.loadInitialRoom();
  loading.setProgress(90);

  // 9. UI Systems
  const hud = new HUD();
  const projectOverlay = new ProjectCardOverlay();
  const chatPanel = new ChatPanel();
  const contactOverlay = new ContactFormOverlay();
  const journalOverlay = new JournalOverlay();
  const pauseOverlay = new PauseMenuOverlay();
  const tvOverlay = new TVVideoOverlay();
  const aboutOverlay = new AboutOverlay();
  const educationOverlay = new EducationOverlay();
  const resumeOverlay = new ResumeOverlay();

  // Focus Camera Events
  eventBus.on('interaction:trigger', (id: string) => {
    const interactable = (sceneManager.currentRoom as any)?.interactables?.get?.(id);
    if (interactable?.focusPose) {
      focusCamera.focus(interactable.focusPose, followCamera.currentLookAt);
    }
  });

  eventBus.on('camera:unfocus', () => {
    focusCamera.unfocus();
  });

  // 10. Main Fixed Render Loop
  loop.addCallback((delta, elapsed) => {
    // 1. Controller & Movement
    controller.update(delta, followCamera.camera);

    // 2. Companion Following
    companion.update(delta, avatar.position, avatar.rotationY);

    // 3. Room & Systems
    sceneManager.update(delta);
    themeManager.update(delta);
    jellyController.update(delta);
    sparkleSystem.update(delta, followCamera.camera);

    // 4. Camera (Focus camera takes priority when active)
    const isHandlingFocus = focusCamera.update(delta);
    if (!isHandlingFocus) {
      followCamera.update(delta, avatar.position, avatar.rotationY);
    }

    // 5. Projected 2D HUD Prompts
    hud.update(followCamera.camera);

    // 6. Render
    appRenderer.renderer.render(scene, followCamera.camera);
  });

  // Dev-only handle for debugging and screenshots (stripped from production builds)
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__portfolio = { eventBus, store, avatar, followCamera };
  }

  loop.start();
  loading.setProgress(100);
  console.log('✨ "Little Game Room" interactive 3D portfolio initialized successfully!');
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
});
