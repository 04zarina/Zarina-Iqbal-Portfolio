"""Build public/models/avatar/avatar_rigged.glb from the Mixamo FBX files.

Run with Blender 4.4+ (headless):
  blender -b --factory-startup --python scripts/build_avatar.py -- <zuzu folder> <out.glb>

<zuzu folder> holds zarina_mixamo_RIGGED.fbx and animations/*.fbx (Mixamo, same skeleton).
The raw GLB is then compressed with gltf-transform (meshopt + 1024 WebP), see README.
"""
import bpy, os, sys, math

args = sys.argv[sys.argv.index("--") + 1:]
ZUZU, OUT = args[0], args[1]
ANIMS = {  # clip name in the GLB -> Mixamo file
    "Walk": "Walk.fbx",
    "Wave": "Waving.fbx",
    "Sitting": "Sitting.fbx",
    "LyingDown": "Lying Down.fbx",
    "Petting": "Petting.fbx",
    "Throw": "Throw.fbx",
}

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30

base_file = next(f for f in os.listdir(ZUZU) if f.lower().endswith("rigged.fbx"))
bpy.ops.import_scene.fbx(filepath=os.path.join(ZUZU, base_file))
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
arm.name = "Armature"
mesh = next(o for o in bpy.data.objects if o.type == "MESH")
mesh.name = "Zarina"
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
if arm.animation_data is None:
    arm.animation_data_create()

actions = {}
for clip, fname in ANIMS.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(ZUZU, "animations", fname))
    new = set(bpy.data.objects) - before
    src = next(o for o in new if o.type == "ARMATURE")
    act = src.animation_data.action
    act.name = clip
    act.use_fake_user = True
    actions[clip] = act
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)


def fcurves_of(act):
    """All F-curves of an action (layered actions in Blender 4.4+, legacy before)."""
    if hasattr(act, "layers") and act.layers:
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out.extend(bag.fcurves)
        return out
    return list(act.fcurves)


def new_fcurve(act, path, index, group):
    if hasattr(act, "layers"):
        if not act.slots:
            act.slots.new(id_type="OBJECT", name="Armature")
        if not act.layers:
            act.layers.new("Layer").strips.new(type="KEYFRAME")
        bag = act.layers[0].strips[0].channelbag(act.slots[0], ensure=True)
        return bag.fcurves.new(path, index=index, group_name=group)
    return act.fcurves.new(path, index=index, action_group=group)


def copy_reversed(src, name):
    """Same clip played backwards (LyingDown -> WakeUp)."""
    dst = bpy.data.actions.new(name)
    dst.use_fake_user = True
    f0, f1 = (int(x) for x in src.frame_range)
    for fc in fcurves_of(src):
        group = fc.group.name if fc.group else ""
        nf = new_fcurve(dst, fc.data_path, fc.array_index, group)
        frames = list(range(f0, f1 + 1))
        nf.keyframe_points.add(len(frames))
        for i, f in enumerate(frames):
            kp = nf.keyframe_points[i]
            kp.co = (f, fc.evaluate(f0 + f1 - f))
            kp.interpolation = "LINEAR"
    return dst


def make_idle(src, name, length=90):
    """Gentle breathing loop built from the first (relaxed, arms down) frame of `src`."""
    dst = bpy.data.actions.new(name)
    dst.use_fake_user = True
    f0 = int(src.frame_range[0])
    breathe = {  # bone -> (quaternion component index, amplitude in radians)
        "mixamorig:Spine": (1, 0.012),
        "mixamorig:Spine1": (1, 0.018),
        "mixamorig:Spine2": (1, 0.022),
        "mixamorig:Neck": (1, -0.03),
        "mixamorig:LeftArm": (3, 0.025),
        "mixamorig:RightArm": (3, -0.025),
        "mixamorig:LeftShoulder": (2, 0.015),
        "mixamorig:RightShoulder": (2, -0.015),
    }
    for fc in fcurves_of(src):
        group = fc.group.name if fc.group else ""
        nf = new_fcurve(dst, fc.data_path, fc.array_index, group)
        v0 = fc.evaluate(f0)
        bone = fc.data_path.split('"')[1] if '"' in fc.data_path else ""
        amp = 0.0
        if fc.data_path.endswith("rotation_quaternion") and bone in breathe and breathe[bone][0] == fc.array_index:
            amp = breathe[bone][1] / 2  # quaternion component ~ half angle
        if fc.data_path.endswith("location") and bone == "mixamorig:Hips" and fc.array_index == 1:
            amp = -0.4  # hips dip a hair (centimetre units)
        keys = [0, length // 4, length // 2, 3 * length // 4, length]
        nf.keyframe_points.add(len(keys))
        for i, k in enumerate(keys):
            s = math.sin(2 * math.pi * k / length)
            nf.keyframe_points[i].co = (1 + k, v0 + amp * s)
            nf.keyframe_points[i].interpolation = "BEZIER"
    return dst


actions["WakeUp"] = copy_reversed(actions["LyingDown"], "WakeUp")
actions["Idle"] = make_idle(actions["Wave"], "Idle")

# One NLA track per clip; the glTF exporter turns each track into an animation.
for clip in ["Idle", "Walk", "Wave", "Sitting", "LyingDown", "WakeUp", "Petting", "Throw"]:
    act = actions[clip]
    track = arm.animation_data.nla_tracks.new()
    track.name = clip
    strip = track.strips.new(clip, int(act.frame_range[0]), act)
    if hasattr(strip, "action_slot") and act.slots:
        strip.action_slot = act.slots[0]
    track.mute = False
arm.animation_data.action = None

# 1024 px base colour; exported as WebP below
for img in bpy.data.images:
    if img.size[0] > 1024:
        img.scale(1024, 1024)

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_image_format="WEBP",
    export_animation_mode="NLA_TRACKS",
    export_anim_slide_to_zero=True,
    export_force_sampling=True,
    export_frame_step=1,
    export_optimize_animation_size=True,
    export_def_bones=True,
    export_leaf_bone=False,
    export_morph=False,
    export_cameras=False,
    export_lights=False,
)
print("WROTE", OUT, os.path.getsize(OUT))
