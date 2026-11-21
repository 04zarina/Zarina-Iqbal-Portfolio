import * as THREE from 'three';
import { Avatar } from './avatar';
import { collisionSystem } from '../collision';
import { interactionSystem } from '../interaction';
import { store } from '../../core/store';
import { eventBus } from '../../core/events';

export class AvatarController {
  public avatar: Avatar;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public moveDirection: THREE.Vector3 = new THREE.Vector3();

  // Settings
  public walkSpeed = 3.6;
  public runSpeed = 6.2;
  public acceleration = 24.0;
  public damping = 16.0;
  public turnSmoothness = 12.0;

  // Keyboard state
  private keys: Record<string, boolean> = {};

  // Joystick state (normalized -1 to 1)
  public joystickVector = new THREE.Vector2(0, 0);

  constructor(avatar: Avatar) {
    this.avatar = avatar;
    this.initKeyboard();
  }

  private initKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      // Don't capture movement keys when typing inside an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      this.keys[e.code] = true;

      if (e.code === 'KeyE' || e.code === 'Enter') {
        interactionSystem.triggerCurrent();
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.avatar.hop();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  setJoystick(x: number, y: number): void {
    this.joystickVector.set(x, y);
  }

  update(delta: number, camera: THREE.Camera): void {
    if (store.get().inputLocked) {
      this.avatar.isMoving = false;
      this.avatar.update(delta);
      return;
    }

    // 1. Gather directional input
    let inputX = 0;
    let inputZ = 0;

    if (this.keys['KeyW'] || this.keys['ArrowUp']) inputZ -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) inputZ += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) inputX -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) inputX += 1;

    // Merge joystick
    if (this.joystickVector.lengthSq() > 0.05) {
      inputX = this.joystickVector.x;
      inputZ = this.joystickVector.y;
    }

    const inputLength = Math.sqrt(inputX * inputX + inputZ * inputZ);

    // If sleeping and player presses any move key, trigger waking up!
    if (this.avatar.isSleeping && !this.avatar.isWakingUp) {
      if (inputLength > 0.1 || this.keys['Space']) {
        eventBus.emit('bed:wakeup');
      }
      this.avatar.update(delta);
      return;
    }

    // If sitting and player moves or jumps, stand up!
    if (this.avatar.isSitting) {
      if (inputLength > 0.1 || this.keys['Space']) {
        this.avatar.standUp();
        eventBus.emit('avatar:standup');
      } else {
        this.avatar.update(delta);
        return;
      }
    }

    const isRunning = Boolean(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || inputLength > 0.85);

    if (inputLength > 0.1) {
      // Normalize input
      const normX = inputX / (inputLength > 1 ? inputLength : 1);
      const normZ = inputZ / (inputLength > 1 ? inputLength : 1);

      // Camera-relative direction
      const camEuler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      const camYaw = camEuler.y;

      const worldX = normX * Math.cos(camYaw) + normZ * Math.sin(camYaw);
      const worldZ = -normX * Math.sin(camYaw) + normZ * Math.cos(camYaw);

      this.moveDirection.set(worldX, 0, worldZ).normalize();

      // Acceleration
      const targetSpeed = isRunning ? this.runSpeed : this.walkSpeed;
      const targetVel = this.moveDirection.clone().multiplyScalar(targetSpeed);

      this.velocity.lerp(targetVel, Math.min(delta * this.acceleration, 1));

      // Rotation towards direction
      const targetAngle = Math.atan2(this.moveDirection.x, this.moveDirection.z);
      // Smooth shortest angle interpolation
      let angleDiff = targetAngle - this.avatar.rotationY;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      this.avatar.rotationY += angleDiff * Math.min(delta * this.turnSmoothness, 1);
      this.avatar.isMoving = true;
      this.avatar.isRunning = isRunning;
    } else {
      // Damping deceleration
      this.velocity.lerp(new THREE.Vector3(0, 0, 0), Math.min(delta * this.damping, 1));
      if (this.velocity.length() < 0.05) {
        this.velocity.set(0, 0, 0);
        this.avatar.isMoving = false;
        this.avatar.isRunning = false;
      }
    }

    // 2. Move & Resolve Collision
    const newPos = this.avatar.position.clone().addScaledVector(this.velocity, delta);
    const resolvedPos = collisionSystem.resolve(newPos, 0.45);
    this.avatar.position.copy(resolvedPos);

    // 3. Update Avatar animation
    this.avatar.update(delta);

    // 4. Update Interaction detection
    interactionSystem.update(this.avatar.position, this.avatar.rotationY);
  }
}
