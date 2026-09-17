import bpy
from pathlib import Path

SCENE_NAME = "Scene.001"
TARGET_NAME = "Extruded.064"
OUT_DIR = Path("/Users/vasa/Documents/projects work/3divanbadge/badge tamplete/public/models")
OUT_GLB = OUT_DIR / "ivan-scene001-baked.glb"
OUT_BLEND = Path("/Users/vasa/Documents/projects work/3divanbadge/ivan3dbackup_scene001_baked.blend")

scene = bpy.data.scenes[SCENE_NAME]
bpy.context.window.scene = scene
scene.frame_set(scene.frame_start)

# Bake the evaluated transform (including Copy Rotation) into regular keyframes.
# This makes the motion portable to glTF, which has no Blender constraints.
target = bpy.data.objects[TARGET_NAME]
bpy.ops.object.select_all(action="DESELECT")
target.select_set(True)
bpy.context.view_layer.objects.active = target
bpy.ops.nla.bake(
    frame_start=scene.frame_start,
    frame_end=scene.frame_end,
    step=1,
    only_selected=True,
    visual_keying=True,
    clear_constraints=True,
    clear_parents=False,
    use_current_action=False,
    clean_curves=False,
    bake_types={"OBJECT"},
)

OUT_DIR.mkdir(parents=True, exist_ok=True)

# Export every object from Scene.001, including animated empties and meshes.
bpy.ops.object.select_all(action="DESELECT")
for obj in scene.objects:
    if obj.visible_get(view_layer=bpy.context.view_layer):
        obj.select_set(True)

bpy.ops.wm.save_as_mainfile(filepath=str(OUT_BLEND), copy=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUT_GLB),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_force_sampling=True,
    export_frame_range=True,
    export_frame_step=1,
    export_apply=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
    export_yup=True,
)

print(f"EXPORTED: {OUT_GLB}")
print(f"BAKED_BLEND: {OUT_BLEND}")
