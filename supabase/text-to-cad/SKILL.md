---
name: "Text to OpenSCAD"
description: "Use when the user wants to generate a 3D model described in natural language and convert it into OpenSCAD code. Generates complete, valid OpenSCAD code that can be compiled by the browser-based OpenSCAD WebAssembly compiler and rendered in Three.js."
allowed-tools: []
---

# Text to OpenSCAD

This skill converts a natural language description of a 3D object into fully functional OpenSCAD code. The generated code will be compiled by a browser-based OpenSCAD WebAssembly compiler and rendered as a triangular mesh (STL/OFF) in Three.js.

## Key Differences from Traditional CAD

- **Browser-Based Compilation**: OpenSCAD code is compiled in the browser using WebAssembly
- **No Server Execution**: Code is NOT executed on the server - it's compiled client-side
- **Mesh Output**: The output is a triangular mesh (STL/OFF), not parametric STEP files
- **Real-time Preview**: Users see instant 3D preview in the browser
- **Library Support**: Supports BOSL, BOSL2, and MCAD libraries

---

## Phase 1: Understanding the Request

When the user provides a natural language description:

1. **Parse the description** to extract:
   - **Geometry type**: primitive (cube, sphere, cylinder), composite, or complex
   - **Dimensions**: explicit measurements (mm by default) or relative sizing
   - **Features**: holes, fillets, chamfers, patterns, text, etc.
   - **Spatial relationships**: positions, alignments, symmetry
   - **Style hints**: rounded, sharp, organic, mechanical, etc.

2. **Fill in missing details intelligently**:
   - If no units specified -> assume millimeters (mm)
   - If no dimensions specified -> infer reasonable defaults
   - If ambiguous geometry -> choose the most common interpretation
   - If "smooth" mentioned -> use higher `$fn` values for curves

3. **Brief confirmation** (1-2 sentences):
   - Summarize what you will model
   - State key dimensions
   - Note any assumptions made

---

## Phase 2: OpenSCAD Code Generation

Generate complete, self-contained OpenSCAD code following these **mandatory rules**:

### Code Structure Template

```openscad
// ============================================================
// CADAM: {model_name}
// Description: {user_description}
// Generated: {timestamp}
// Units: millimeters (mm)
// ============================================================

// Resolution for curved surfaces
$fn = 50;  // Adjust for smoothness vs performance

// ============================================================
// Parameters (adjustable)
// ============================================================
{parameter_definitions}

// ============================================================
// Model Construction
// ============================================================
{construction_code}

// ============================================================
// Rendering Hint (comment for AI context)
// Output: Triangular mesh via OpenSCAD WASM
// ============================================================
```

### Essential OpenSCAD Syntax

**Primitives:**
```openscad
cube([width, depth, height], center=true);
sphere(r=radius);
cylinder(h=height, r=radius, center=true);
cylinder(h=height, d=diameter, center=true);
polyhedron(points, faces);
```

**2D to 3D:**
```openscad
linear_extrude(height=height)
    circle(r=10);
linear_extrude(height=height)
    square([10, 20]);
linear_extrude(height=height, twist=45)
    circle(r=5);
rotate_extrude(angle=360)
    translate([10, 0, 0])
        circle(r=5);
```

**Transformations:**
```openscad
translate([x, y, z])        // Move
rotate([ax, ay, az])        // Rotate
scale([sx, sy, sz])         // Scale
mirror([1, 0, 0])          // Mirror
multmatrix(matrix)          // Custom transform
color("red")                // Visual color (for Three.js rendering)
```

**Boolean Operations:**
```openscad
union() { }                 // Combine shapes
difference() { }            // Subtract shapes
intersection() { }          // Keep overlap
```

**Modifications:**
```openscad
offset(r=delta)             // Expand/shrink 2D
offset(delta=-1)            // Inset 2D
minkowski() { }              // Minkowski sum
hull() { }                  // Convex hull
```

**Selections:**
```openscad
select(n)                   // Select child n (0-indexed)
echo("message")             // Debug output
```

### Common Operations

**Rounded Box:**
```openscad
module rounded_cube(size, radius) {
    r = min(radius, min(size.x, size.y) / 2);
    hull() {
        for (x = [r, size.x - r], y = [r, size.y - r], z = [r, size.z - r])
            translate([x - size.x/2, y - size.y/2, z - size.z/2])
                sphere(r=r);
    }
}
```

**Hole/Cutout:**
```openscad
difference() {
    cube([20, 30, 10]);
    cylinder(h=15, r=5, center=true);
}
```

**Fillet (using BOSL library):**
```openscad
include <BOSL/metric_screws.scad>
screw("M5", length=20);
```

**Text:**
```openscad
linear_extrude(height=2)
    text("HELLO", size=10, font="Arial:style=Bold");
```

**Pattern/Array:**
```openscad
for (x = [-10, 0, 10])
    translate([x, 0, 0])
        sphere(r=5);
```

### Code Quality Rules

1. **Reasonable `$fn` values**:
   - Preview: `$fn = 16-32`
   - Final: `$fn = 50-100`
   - Large spheres: `$fn = 20` (performance)

2. **Center everything** when possible - easier to work with

3. **Use modules** for reusable components:
   ```openscad
   module gear(teeth=20, radius=20) {
       // gear implementation
   }
   ```

4. **Comment complex operations** - helps debugging

5. **Avoid very thin features** - may not render correctly

6. **Manifold geometry** - ensure no self-intersections

### Common Pitfalls to AVOID

- `$fn` too high (>200) -> performance issues
- Very thin walls (<0.1mm) -> rendering problems
- Non-manifold geometry -> compilation errors
- Overlapping primitives in union -> unnecessary complexity
- Missing `center=true` on cylinders -> off-center

---

## Phase 3: Special Considerations for WebAssembly Compilation

### What Works:
- ‚ú?All standard OpenSCAD primitives
- ‚ú?Boolean operations
- ‚ú?Extrusions (linear, rotate)
- ‚ú?Transform operations
- ‚ú?BOSL, BOSL2, MCAD libraries (auto-loaded)
- ‚ú?Color commands (rendered in Three.js)

### Limitations:
- ‚ö†Ô∏è Large `$fn` values may cause browser performance issues
- ‚ö†Ô∏è Very complex CSG operations may timeout
- ‚ö†Ô∏è Some native functions may not be available

### Performance Tips:
- Use `$fn = 50` for smooth curves
- Use `$fa` and `$fs` for adaptive resolution
- Simplify geometry where possible
- Use `hull()` for complex organic shapes

---

## Phase 4: Output Format

The generated code should be **complete and ready to compile**. The AI should:

1. **Return only the OpenSCAD code** (no markdown code blocks)
2. **Include helpful comments** explaining key sections
3. **Set reasonable defaults** for all parameters
4. **Ensure code is valid** - no syntax errors

### Example Output

User: "a rounded box with a hole in the middle"

```openscad
// ============================================================
// CADAM: Rounded Box with Hole
// Description: a rounded box with a hole in the middle
// Generated: 2024
// Units: millimeters (mm)
// ============================================================

$fn = 50;

// Parameters
box_width = 40;
box_depth = 30;
box_height = 20;
corner_radius = 5;
hole_diameter = 15;

// Rounded box using hull of spheres
module rounded_box(size, r) {
    hull() {
        for (x = [r, size[0] - r], y = [r, size[1] - r], z = [r, size[2] - r])
            translate([x - size[0]/2, y - size[1]/2, z - size[2]/2])
                sphere(r=r);
    }
}

// Main model
difference() {
    rounded_box([box_width, box_depth, box_height], corner_radius);
    cylinder(h=box_height + 2, r=hole_diameter/2, center=true);
}
```

---

## Response Language

Always respond in the **same language as the user's message**. If the user writes in Chinese, respond in Chinese. If in English, respond in English.

---

## Quick Reference

| Feature | OpenSCAD Syntax |
|---------|----------------|
| Box | `cube([w, d, h], center=true)` |
| Sphere | `sphere(r=radius)` |
| Cylinder | `cylinder(h=h, r=r, center=true)` |
| Hole | `difference() { shape; cutter; }` |
| Union | `union() { a; b; }` |
| Round edges | `hull() of spheres` |
| 2D to 3D | `linear_extrude(h) 2d_shape` |
| Smooth | `$fn = 50;` |

// @author Kiritohuxing
