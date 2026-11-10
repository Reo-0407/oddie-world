# Blender 안에서 실행: blender -b -P thumbs.py -- <GLB 폴더> <출력 폴더>
# 각 GLB를 정면 3/4 각도로 찍어 192x192 투명 PNG로 저장한다(이미 있으면 건너뜀).
import bpy, sys, os, glob, math
from mathutils import Vector

src, dst = [os.path.abspath(p) for p in sys.argv[sys.argv.index('--') + 1:][:2]]
os.makedirs(dst, exist_ok=True)

for path in sorted(glob.glob(os.path.join(src, '*.glb'))):
    out = os.path.join(dst, os.path.splitext(os.path.basename(path))[0] + '.png')
    if os.path.exists(out):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    # 한 덩어리 메시 안의 떨어진 조각들을 나눈다(바닥판이 캐릭터와 붙어 있지 않은 경우)
    for o in [o for o in bpy.context.scene.objects if o.type == 'MESH']:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.separate(type='LOOSE')
        bpy.ops.object.mode_set(mode='OBJECT')
    import bmesh
    def bounds(objs):
        pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
        return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
                Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    lo, hi = bounds(meshes)
    H = hi.z - lo.z
    # 바닥판: 맨 아래 띠의 평평한 면을 지우고, 떨어진 조각 중 납작하거나 아주 작은 것을 지운다
    for o in meshes:
        bm = bmesh.new(); bm.from_mesh(o.data)
        mw = o.matrix_world
        kill = [f for f in bm.faces if abs((mw.to_3x3() @ f.normal).z) > 0.85 and (mw @ f.calc_center_median()).z < lo.z + 0.10 * H]
        if kill:
            bmesh.ops.delete(bm, geom=kill, context='FACES')
        seen = set(); comps = []
        for f in bm.faces:
            if f.index in seen:
                continue
            stack = [f]; seen.add(f.index); comp = []
            while stack:
                cur = stack.pop(); comp.append(cur)
                for e in cur.edges:
                    for nf in e.link_faces:
                        if nf.index not in seen:
                            seen.add(nf.index); stack.append(nf)
            comps.append(comp)
        def ext(comp):
            vs = {v for f in comp for v in f.verts}
            ps = [mw @ v.co for v in vs]
            return [max(q[i] for q in ps) - min(q[i] for q in ps) for i in range(3)]
        big = max((max(ext(c)) for c in comps), default=0)
        for c in comps:
            d = sorted(ext(c))
            if len(comps) > 1 and ((d[0] < 0.08 * d[2] and d[2] > 0.4 * big) or d[2] < 0.22 * big):
                bmesh.ops.delete(bm, geom=c, context='FACES')
        bm.to_mesh(o.data); bm.free()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and len(o.data.polygons) > 0]
    if not meshes:
        continue
    lo, hi = bounds(meshes)
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.01)

    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = scene.render.resolution_y = 192
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    shading.color_type = 'TEXTURE'
    shading.show_specular_highlight = False
    scene.view_settings.view_transform = 'Standard'

    cam_data = bpy.data.cameras.new('cam')
    cam_data.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    dist = radius * 4
    angle = math.radians(25)
    elev = math.radians(15)
    cam.location = center + Vector((math.sin(angle) * math.cos(elev), -math.cos(angle) * math.cos(elev), math.sin(elev))) * dist
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    loc = [inv @ (o.matrix_world @ v.co) for o in meshes for v in o.data.vertices]
    xs = sorted(p.x for p in loc); ys = sorted(p.y for p in loc)
    k = max(1, len(xs) // 40)
    xs = xs[k:-k]; ys = ys[k:-k]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    cam.location = cam.matrix_world @ Vector((cx, cy, 0))
    cam_data.ortho_scale = max(max(xs) - min(xs), max(ys) - min(ys)) * 1.22

    scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('OK', out)
