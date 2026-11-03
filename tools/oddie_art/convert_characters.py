# blender -b -P convert_characters.py -- <fbx폴더> <출력폴더> 이름1 이름2 ...
import bpy, sys, os
args = sys.argv[sys.argv.index('--') + 1:]
src, dst, names = args[0], args[1], args[2:]
os.makedirs(dst, exist_ok=True)
for n in names:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=os.path.join(src, n + '.fbx'))
    for img in bpy.data.images:
        if img.size[0] > 512: img.scale(512, 512)
    out = os.path.join(dst, n.lower() + '.glb')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_image_format='JPEG', export_animations=True)
    acts = [a.name for a in bpy.data.actions]
    tris = sum(len(p.vertices)-2 for o in bpy.data.objects if o.type=='MESH' for p in o.data.polygons)
    print('OK', n, os.path.getsize(out)//1024, 'KB tris', tris, 'anims', acts)
