# Blender 안에서 실행: blender -b -P optimize.py -- <입력폴더> <출력폴더>
# 원본 GLB(약 1.5MB)를 삼각형 6000개, 텍스처 512px로 줄여 public/models 에 저장한다.
import bpy, sys, os, glob

src, dst = sys.argv[sys.argv.index('--') + 1:][:2]
os.makedirs(dst, exist_ok=True)
for path in sorted(glob.glob(os.path.join(src, '*.glb'))):
    out = os.path.join(dst, os.path.basename(path))
    if os.path.exists(out):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    for ob in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        if tris > 6000:
            bpy.context.view_layer.objects.active = ob
            m = ob.modifiers.new('d', 'DECIMATE')
            m.ratio = 6000 / tris
            bpy.ops.object.modifier_apply(modifier='d')
    for img in bpy.data.images:
        if img.size[0] > 512:
            img.scale(512, 512)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB',
                              export_image_format='JPEG', export_image_quality=80)
    print('OK', out, os.path.getsize(out) // 1024, 'KB')
