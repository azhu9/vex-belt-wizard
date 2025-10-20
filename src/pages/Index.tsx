import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BeltVisualizer } from "@/components/BeltVisualizer";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const AVAILABLE_BELTS = [60, 70, 80, 90, 100, 104, 110, 120, 130, 140, 150, 160, 170, 180, 170, 200, 225, 250];

const HTD_THIN_BELTS = [];
const HTD_THICK_BELTS = [60, 70, 80, 90, 100, 104, 110, 120, 130, 140, 150, 160, 170, 180, 170, 200, 225, 250];
const GT_BELTS = [];

const Index = () => {
  const [mode, setMode] = useState<"find-belt" | "find-center">("find-belt");
  const [unit, setUnit] = useState<"mm" | "inches">("mm");
  
  // Mode 1 inputs
  const [n1, setN1] = useState<string>("20");
  const [n2, setN2] = useState<string>("40");
  const [desiredCenter, setDesiredCenter] = useState<string>("200");
  
  // Mode 2 inputs
  const [n1Mode2, setN1Mode2] = useState<string>("20");
  const [n2Mode2, setN2Mode2] = useState<string>("40");
  const [beltLength, setBeltLength] = useState<string>("120");

  const pitch = 5; // mm
  const MM_TO_INCHES = 0.0393701;
  
  const convertToDisplay = (mm: number) => unit === "inches" ? mm * MM_TO_INCHES : mm;
  const convertToMm = (value: number) => unit === "inches" ? value / MM_TO_INCHES : value;

  // Mode 1: Calculate ideal belt length and find closest
  const calculateMode1 = (): { 
    idealLength: number; 
    closestBelt: number; 
    error: number; 
    actualCenter: number; 
    status: "good" | "tight" | "loose" 
  } | null => {
    const N1 = parseFloat(n1);
    const N2 = parseFloat(n2);
    const C = convertToMm(parseFloat(desiredCenter));
    
    if (isNaN(N1) || isNaN(N2) || isNaN(C) || N1 <= 0 || N2 <= 0 || C <= 0) {
      return null;
    }

    // Formula: Lt = (2C/P) + ((N1 + N2)/2) + ((N2 - N1)^2 / (4π^2 * C/P))
    const Lt = (2 * C / pitch) + ((N1 + N2) / 2) + (Math.pow(N2 - N1, 2) / (4 * Math.PI * Math.PI * (C / pitch)));
    
    // Find closest available belt
    const closest = AVAILABLE_BELTS.reduce((prev, curr) => 
      Math.abs(curr - Lt) < Math.abs(prev - Lt) ? curr : prev
    );
    
    // Calculate actual center distance with closest belt
    const actualC = calculateCenterDistance(N1, N2, closest);
    const error = actualC - C;
    
    return {
      idealLength: Lt,
      closestBelt: closest,
      error: error,
      actualCenter: actualC,
      status: Math.abs(error) < 1 ? "good" : (error > 0 ? "loose" : "tight")
    };
  };

  // Mode 2: Calculate center distance from belt length
  const calculateCenterDistance = (N1: number, N2: number, Lt: number): number => {
    // Formula: C = (P/4) * (Lt - (N1+N2)/2 + sqrt((Lt - (N1+N2)/2)^2 - (2/π^2)(N2-N1)^2))
    const term1 = Lt - (N1 + N2) / 2;
    const term2 = Math.sqrt(
      Math.pow(term1, 2) - (2 / (Math.PI * Math.PI)) * Math.pow(N2 - N1, 2)
    );
    return (pitch / 4) * (term1 + term2);
  };

  const calculateMode2 = (): { centerDistance: number; status: "good" | "tight" | "loose" } | null => {
    const N1 = parseFloat(n1Mode2);
    const N2 = parseFloat(n2Mode2);
    const Lt = parseFloat(beltLength);
    
    if (isNaN(N1) || isNaN(N2) || isNaN(Lt) || N1 <= 0 || N2 <= 0 || Lt <= 0) {
      return null;
    }

    const C = calculateCenterDistance(N1, N2, Lt);
    
    if (isNaN(C) || C <= 0) {
      return null;
    }

    return {
      centerDistance: C,
      status: "good"
    };
  };

  const result1 = calculateMode1();
  const result2 = calculateMode2();

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-foreground">VEX Belt Calculator</h1>
          <p className="text-muted-foreground">HTD 5mm Pitch Timing Belt Calculator</p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Label htmlFor="unit-toggle" className="text-sm">mm</Label>
            <Switch
              id="unit-toggle"
              checked={unit === "inches"}
              onCheckedChange={(checked) => setUnit(checked ? "inches" : "mm")}
            />
            <Label htmlFor="unit-toggle" className="text-sm">inches</Label>
          </div>
        </header>

        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="find-belt">Find Belt Size</TabsTrigger>
            <TabsTrigger value="find-center">Find Center Distance</TabsTrigger>
          </TabsList>

          <TabsContent value="find-belt" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Find Closest Belt Size</CardTitle>
                <CardDescription>
                  Calculate the ideal belt length and find the closest available size
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="n1">Sprocket 1 (teeth)</Label>
                    <Input
                      id="n1"
                      type="number"
                      value={n1}
                      onChange={(e) => setN1(e.target.value)}
                      min="1"
                      placeholder="20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="n2">Sprocket 2 (teeth)</Label>
                    <Input
                      id="n2"
                      type="number"
                      value={n2}
                      onChange={(e) => setN2(e.target.value)}
                      min="1"
                      placeholder="40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="center">Center Distance ({unit})</Label>
                    <Input
                      id="center"
                      type="number"
                      value={desiredCenter}
                      onChange={(e) => setDesiredCenter(e.target.value)}
                      min="0"
                      step="0.1"
                      placeholder={unit === "mm" ? "200" : "7.87"}
                    />
                  </div>
                </div>

                {result1 && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-lg bg-secondary">
                        <p className="text-sm text-muted-foreground mb-1">Ideal Belt Length</p>
                        <p className="text-2xl font-bold">{result1.idealLength.toFixed(1)} T</p>
                      </div>
                      <div className="p-4 rounded-lg bg-primary/10">
                        <p className="text-sm text-muted-foreground mb-1">Closest Available</p>
                        <p className="text-2xl font-bold text-primary">{result1.closestBelt} T</p>
                      </div>
                      <div className="p-4 rounded-lg bg-secondary">
                        <p className="text-sm text-muted-foreground mb-1">Error</p>
                        <div className="flex items-center gap-2">
                          <p className="text-2xl font-bold">{convertToDisplay(Math.abs(result1.error)).toFixed(unit === "mm" ? 1 : 3)} {unit}</p>
                          <Badge 
                            variant={
                              result1.status === "good" ? "default" : 
                              result1.status === "tight" ? "destructive" : 
                              "secondary"
                            }
                            className={
                              result1.status === "good" ? "bg-success hover:bg-success/90" :
                              result1.status === "loose" ? "bg-warning hover:bg-warning/90" : ""
                            }
                          >
                            {result1.status === "good" ? "Good" : result1.error > 0 ? "Loose" : "Tight"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {result1 && (
              <BeltVisualizer
                n1={parseFloat(n1)}
                n2={parseFloat(n2)}
                centerDistance={result1.actualCenter}
                status={result1.status}
              />
            )}
          </TabsContent>

          <TabsContent value="find-center" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Find Center-to-Center Distance</CardTitle>
                <CardDescription>
                  Calculate the center distance for a given belt length
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="n1-m2">Sprocket 1 (teeth)</Label>
                    <Input
                      id="n1-m2"
                      type="number"
                      value={n1Mode2}
                      onChange={(e) => setN1Mode2(e.target.value)}
                      min="1"
                      placeholder="20"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="n2-m2">Sprocket 2 (teeth)</Label>
                    <Input
                      id="n2-m2"
                      type="number"
                      value={n2Mode2}
                      onChange={(e) => setN2Mode2(e.target.value)}
                      min="1"
                      placeholder="40"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="belt">Belt Length (teeth)</Label>
                    <Input
                      id="belt"
                      type="number"
                      value={beltLength}
                      onChange={(e) => setBeltLength(e.target.value)}
                      min="1"
                      placeholder="120"
                    />
                  </div>
                </div>

                {result2 && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="p-4 rounded-lg bg-primary/10">
                      <p className="text-sm text-muted-foreground mb-1">Center-to-Center Distance</p>
                      <p className="text-3xl font-bold text-primary">{convertToDisplay(result2.centerDistance).toFixed(unit === "mm" ? 1 : 3)} {unit}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {result2 && (
              <BeltVisualizer
                n1={parseFloat(n1Mode2)}
                n2={parseFloat(n2Mode2)}
                centerDistance={result2.centerDistance}
                status={result2.status}
              />
            )}
          </TabsContent>
        </Tabs>

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-lg">15mm Belt Sizes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_BELTS.map((size) => (
                <Badge key={size} variant="outline">
                  {size}T
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
