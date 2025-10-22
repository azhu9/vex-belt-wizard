import { Settings, Calculator, Ruler, Info, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AppSidebarProps {
  mode: "find-belt" | "find-center";
  onModeChange: (mode: "find-belt" | "find-center") => void;
  unit: "mm" | "inches";
  onUnitChange: (unit: "mm" | "inches") => void;
  beltType: "HTD_THIN" | "HTD_THICK" | "GT";
  onBeltTypeChange: (beltType: "HTD_THIN" | "HTD_THICK" | "GT") => void;
}

export function AppSidebar({ mode, onModeChange, unit, onUnitChange, beltType, onBeltTypeChange }: AppSidebarProps) {
  const { open } = useSidebar();
  const { theme, setTheme } = useTheme();

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Calculator Mode</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mode === "find-belt"}
                  onClick={() => onModeChange("find-belt")}
                >
                  <Calculator className="h-4 w-4" />
                  <span>Find Belt Size</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mode === "find-center"}
                  onClick={() => onModeChange("find-center")}
                >
                  <Ruler className="h-4 w-4" />
                  <span>Find Center Distance</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-4 px-3 py-2">
            <div className="space-y-2">
              <Label htmlFor="belt-type" className="text-sm">Belt Type</Label>
              <Select value={beltType} onValueChange={(value) => onBeltTypeChange(value as typeof beltType)}>
                <SelectTrigger id="belt-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HTD_THIN">HTD 9mm</SelectItem>
                  <SelectItem value="HTD_THICK">HTD 15mm</SelectItem>
                  <SelectItem value="GT">GT2 9mm</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Units</Label>
              <div className="flex items-center gap-3">
                <span className="text-sm">mm</span>
                <Switch
                  checked={unit === "inches"}
                  onCheckedChange={(checked) => onUnitChange(checked ? "inches" : "mm")}
                />
                <span className="text-sm">inches</span>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              tooltip="Toggle theme"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="h-4 w-4" />
                  <span>Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4" />
                  <span>Dark Mode</span>
                </>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
