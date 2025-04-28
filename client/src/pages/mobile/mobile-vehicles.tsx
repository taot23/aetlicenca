import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MobileLayout } from "@/components/layouts/mobile-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, Search, X } from "lucide-react";
import { 
  Dialog, 
  DialogContent, 
  DialogTrigger, 
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { VehicleType, VehicleBodyType } from "@shared/schema";
import { cn } from "@/lib/utils";

const getVehicleTypeLabel = (type: VehicleType) => {
  const types: Record<VehicleType, string> = {
    tractor_unit: "Cavalo Mecânico",
    semi_trailer: "Semirreboque",
    trailer: "Reboque",
    dolly: "Dolly",
    flatbed: "Prancha",
    truck: "Caminhão",
  };
  return types[type] || type;
};

const getBodyTypeLabel = (type?: VehicleBodyType) => {
  if (!type) return "N/A";
  const types: Record<string, string> = {
    open: "Aberta",
    dump: "Basculante",
    container: "Porta-Container",
    closed: "Fechada",
    tank: "Tanque",
  };
  return types[type] || type;
};

export default function MobileVehiclesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [openVehicleDialogs, setOpenVehicleDialogs] = useState<Record<number, boolean>>({});
  
  // Buscar veículos
  const { data: vehicles, isLoading } = useQuery({
    queryKey: ["/api/vehicles"],
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
  
  // Filtrar veículos baseado no termo de busca
  const filteredVehicles = vehicles?.filter((vehicle: any) => {
    if (!searchTerm) return true;
    
    const search = searchTerm.toLowerCase();
    return (
      (vehicle.plate && vehicle.plate.toLowerCase().includes(search)) ||
      (vehicle.brand && vehicle.brand.toLowerCase().includes(search)) ||
      (vehicle.model && vehicle.model.toLowerCase().includes(search)) ||
      (getVehicleTypeLabel(vehicle.type).toLowerCase().includes(search))
    );
  });
  
  // Funções para controlar o diálogo de cada veículo
  const openVehicleDialog = (id: number) => {
    setOpenVehicleDialogs(prev => ({ ...prev, [id]: true }));
  };
  
  const closeVehicleDialog = (id: number) => {
    setOpenVehicleDialogs(prev => ({ ...prev, [id]: false }));
  };
  
  return (
    <MobileLayout title="Meus Veículos">
      <div className="space-y-4">
        {/* Barra de busca e botão de adicionar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Buscar veículo..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button size="icon">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] p-0 h-[90vh] overflow-y-auto mobile-form-dialog">
              <VehicleForm
                onSuccess={() => setIsFormOpen(false)}
                onCancel={() => setIsFormOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
        
        {/* Lista de veículos */}
        <div className="space-y-3">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-6 w-[120px]" />
                    <Skeleton className="h-5 w-[80px]" />
                  </div>
                  <Skeleton className="h-4 w-[200px] mt-2" />
                  <div className="flex justify-between mt-3">
                    <Skeleton className="h-4 w-[100px]" />
                    <Skeleton className="h-4 w-[60px]" />
                  </div>
                </CardContent>
              </Card>
            ))
          ) : filteredVehicles?.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {searchTerm 
                  ? "Nenhum veículo encontrado para esta busca" 
                  : "Você ainda não tem veículos cadastrados"}
              </p>
              {!searchTerm && (
                <Button className="mt-4" onClick={() => setIsFormOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Veículo
                </Button>
              )}
            </div>
          ) : (
            filteredVehicles?.map((vehicle) => (
              <Dialog 
                key={vehicle.id} 
                open={openVehicleDialogs[vehicle.id] || false}
                onOpenChange={(open) => {
                  if (open) {
                    openVehicleDialog(vehicle.id);
                  } else {
                    closeVehicleDialog(vehicle.id);
                  }
                }}
              >
                <DialogTrigger asChild>
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-center">
                        <h3 className="font-semibold">
                          {vehicle.plate}
                        </h3>
                        <span
                          className={cn(
                            "text-xs px-2 py-1 rounded-full",
                            {
                              "bg-blue-100 text-blue-800": vehicle.type === "tractor_unit",
                              "bg-green-100 text-green-800": vehicle.type === "semi_trailer" || vehicle.type === "trailer",
                              "bg-orange-100 text-orange-800": vehicle.type === "dolly",
                              "bg-purple-100 text-purple-800": vehicle.type === "flatbed",
                              "bg-indigo-100 text-indigo-800": vehicle.type === "truck",
                            }
                          )}
                        >
                          {getVehicleTypeLabel(vehicle.type)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {vehicle.brand} {vehicle.model} ({vehicle.manufacturingYear})
                      </p>
                      <div className="flex justify-between items-center mt-2 text-xs text-muted-foreground">
                        <span>Renavam: {vehicle.renavam}</span>
                        <span>{vehicle.axleCount} eixos</span>
                      </div>
                      {vehicle.bodyType && (
                        <div className="mt-1 text-xs">
                          <span className="bg-gray-100 text-gray-800 rounded-full px-2 py-0.5">
                            {getBodyTypeLabel(vehicle.bodyType)}
                          </span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px] p-0 max-h-[90vh] h-auto overflow-y-auto mobile-form-dialog">
                  <div className="p-4 border-b">
                    <h2 className="font-semibold text-lg">Informações do Veículo</h2>
                    <p className="text-sm text-muted-foreground">Visualize ou edite as informações do veículo</p>
                  </div>
                  <VehicleForm
                    vehicle={vehicle}
                    onSuccess={() => closeVehicleDialog(vehicle.id)}
                    onCancel={() => closeVehicleDialog(vehicle.id)}
                  />
                </DialogContent>
              </Dialog>
            ))
          )}
        </div>
      </div>
    </MobileLayout>
  );
}