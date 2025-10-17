interface BeltVisualizerProps {
  n1: number;
  n2: number;
  centerDistance: number;
  status: "good" | "tight" | "loose";
}

export const BeltVisualizer = ({ n1, n2, centerDistance, status }: BeltVisualizerProps) => {
  const pitch = 5; // mm
  const scale = 0.8; // Scale factor for visualization
  
  // Calculate sprocket radii (pitch radius = teeth * pitch / (2 * pi))
  const radius1 = (n1 * pitch) / (2 * Math.PI) * scale;
  const radius2 = (n2 * pitch) / (2 * Math.PI) * scale;
  
  // Scale center distance for visualization
  const scaledCenter = centerDistance * scale;
  
  // SVG dimensions
  const padding = 40;
  const svgWidth = scaledCenter + radius1 + radius2 + padding * 2;
  const svgHeight = Math.max(radius1, radius2) * 2 + padding * 2;
  const centerY = svgHeight / 2;
  
  // Sprocket positions
  const x1 = padding + radius1;
  const x2 = x1 + scaledCenter;
  
  // Calculate tangent points for belt
  const radiusDiff = radius2 - radius1;
  const angle = Math.asin(radiusDiff / scaledCenter);
  
  // Top belt segment
  const topX1 = x1 + radius1 * Math.cos(angle);
  const topY1 = centerY - radius1 * Math.sin(angle);
  const topX2 = x2 + radius2 * Math.cos(angle);
  const topY2 = centerY - radius2 * Math.sin(angle);
  
  // Bottom belt segment
  const bottomX1 = x1 - radius1 * Math.cos(angle);
  const bottomY1 = centerY + radius1 * Math.sin(angle);
  const bottomX2 = x2 - radius2 * Math.cos(angle);
  const bottomY2 = centerY + radius2 * Math.sin(angle);
  
  const beltColor = 
    status === "good" ? "hsl(var(--success))" :
    status === "tight" ? "hsl(var(--destructive))" :
    "hsl(var(--warning))";

  return (
    <div className="w-full flex justify-center p-4">
      <svg 
        width={Math.min(svgWidth, 600)} 
        height={Math.min(svgHeight, 300)} 
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="border border-border rounded-lg bg-card"
      >
        {/* Belt paths */}
        <line 
          x1={topX1} 
          y1={topY1} 
          x2={topX2} 
          y2={topY2} 
          stroke={beltColor}
          strokeWidth="4"
          strokeLinecap="round"
        />
        <line 
          x1={bottomX1} 
          y1={bottomY1} 
          x2={bottomX2} 
          y2={bottomY2} 
          stroke={beltColor}
          strokeWidth="4"
          strokeLinecap="round"
        />
        
        {/* Sprocket 1 */}
        <circle
          cx={x1}
          cy={centerY}
          r={radius1}
          fill="hsl(var(--muted))"
          stroke="hsl(var(--border))"
          strokeWidth="2"
        />
        <circle
          cx={x1}
          cy={centerY}
          r={radius1 * 0.3}
          fill="hsl(var(--background))"
          stroke="hsl(var(--border))"
          strokeWidth="2"
        />
        <text
          x={x1}
          y={centerY + 5}
          textAnchor="middle"
          className="text-xs fill-foreground font-medium"
        >
          {n1}T
        </text>
        
        {/* Sprocket 2 */}
        <circle
          cx={x2}
          cy={centerY}
          r={radius2}
          fill="hsl(var(--muted))"
          stroke="hsl(var(--border))"
          strokeWidth="2"
        />
        <circle
          cx={x2}
          cy={centerY}
          r={radius2 * 0.3}
          fill="hsl(var(--background))"
          stroke="hsl(var(--border))"
          strokeWidth="2"
        />
        <text
          x={x2}
          y={centerY + 5}
          textAnchor="middle"
          className="text-xs fill-foreground font-medium"
        >
          {n2}T
        </text>
        
        {/* Center distance dimension line */}
        <line
          x1={x1}
          y1={centerY + Math.max(radius1, radius2) + 20}
          x2={x2}
          y2={centerY + Math.max(radius1, radius2) + 20}
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="1"
          strokeDasharray="4 2"
        />
        <text
          x={(x1 + x2) / 2}
          y={centerY + Math.max(radius1, radius2) + 35}
          textAnchor="middle"
          className="text-xs fill-muted-foreground"
        >
          C = {centerDistance.toFixed(1)} mm
        </text>
      </svg>
    </div>
  );
};
