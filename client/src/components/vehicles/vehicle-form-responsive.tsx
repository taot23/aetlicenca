import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { insertVehicleSchema, vehicleTypeOptions, bodyTypeOptions, Vehicle } from "@shared/schema";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { LoaderCircle, UploadCloud, X } from "lucide-react";
import { getVehicleTypeLabel } from "@/lib/utils";

interface VehicleFormProps {
  vehicle?: Vehicle | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export function VehicleForm({ vehicle, onSuccess, onCancel }: VehicleFormProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  
  // Extend the schema to handle file upload
  const formSchema = insertVehicleSchema.extend({
    tare: z.coerce.number().min(0.1, "O peso deve ser maior que zero"),
    crlvYear: z.coerce.number().min(1990, "O ano deve ser posterior a 1990"),
    axleCount: z.coerce.number().min(1, "A quantidade de eixos deve ser maior que zero").optional(),
  });

  // Estado para controlar os placeholders dinâmicos
  const [vehicleType, setVehicleType] = useState<string>(vehicle?.type || "");
  
  // Estado para o CMT (Capacidade Máxima de Tração)
  const [cmt, setCmt] = useState<number | undefined>(undefined);
  
  // Verificar se há uma placa pré-preenchida (vinda de outro componente)
  useEffect(() => {
    const preFillPlate = localStorage.getItem('preFillPlate');
    if (preFillPlate && form) {
      form.setValue('plate', preFillPlate);
      // Remover do localStorage depois de usar
      localStorage.removeItem('preFillPlate');
    }
  }, []);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: vehicle ? {
      plate: vehicle.plate,
      type: vehicle.type,
      tare: vehicle.tare,
      crlvYear: vehicle.crlvYear,
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      year: vehicle.year || undefined,
      renavam: vehicle.renavam || "",
      axleCount: vehicle.axleCount || undefined,
      remarks: vehicle.remarks || "",
    } : {
      plate: "",
      type: "", // Sem valor padrão para o tipo
      tare: undefined,
      crlvYear: new Date().getFullYear(),
      brand: "",
      model: "",
      year: undefined,
      renavam: "",
      axleCount: undefined,
      remarks: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await apiRequest("POST", "/api/vehicles", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Veículo cadastrado",
        description: "O veículo foi cadastrado com sucesso",
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível cadastrar o veículo",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Semelhante ao método para novo veículo
      const res = await apiRequest("PATCH", `/api/vehicles/${vehicle?.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Veículo atualizado",
        description: "O veículo foi atualizado com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível atualizar o veículo",
        variant: "destructive",
      });
    },
  });
  
  const createWithoutFileMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/vehicles", data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Veículo cadastrado",
        description: "O veículo foi cadastrado com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível cadastrar o veículo",
        variant: "destructive",
      });
    },
  });
  
  const updateWithoutFileMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", `/api/vehicles/${vehicle?.id}`, data);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Veículo atualizado", 
        description: "O veículo foi atualizado com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível atualizar o veículo",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (file) {
      // Se tiver arquivo, usar FormData
      const formData = new FormData();
      
      const vehicleData = {
        plate: values.plate.toUpperCase(),
        type: values.type,
        bodyType: values.bodyType || undefined,
        tare: Number(values.tare),
        crlvYear: Number(values.crlvYear),
        brand: values.brand,
        model: values.model,
        year: values.year,
        renavam: values.renavam,
        axleCount: values.axleCount,
        remarks: values.remarks
      };
      
      // Para veículos sem arquivo, enviar diretamente como JSON
      formData.append("plate", vehicleData.plate);
      formData.append("type", vehicleData.type);
      formData.append("tare", vehicleData.tare.toString());
      formData.append("crlvYear", vehicleData.crlvYear.toString());
      
      if (vehicleData.bodyType) formData.append("bodyType", vehicleData.bodyType);
      if (vehicleData.brand) formData.append("brand", vehicleData.brand);
      if (vehicleData.model) formData.append("model", vehicleData.model);
      if (vehicleData.year) formData.append("year", vehicleData.year.toString());
      if (vehicleData.renavam) formData.append("renavam", vehicleData.renavam);
      if (vehicleData.axleCount) formData.append("axleCount", vehicleData.axleCount.toString());
      if (vehicleData.remarks) formData.append("remarks", vehicleData.remarks);
      
      formData.append("crlvFile", file);
      
      console.log("Sending vehicle data with file:", vehicleData);
      
      if (vehicle) {
        updateMutation.mutate(formData);
      } else {
        createMutation.mutate(formData);
      }
    } else {
      // Se não tiver arquivo, enviar diretamente como JSON
      const vehicleData = {
        plate: values.plate.toUpperCase(),
        type: values.type,
        bodyType: values.bodyType || undefined,
        tare: Number(values.tare),
        crlvYear: Number(values.crlvYear),
        brand: values.brand,
        model: values.model,
        year: values.year,
        renavam: values.renavam,
        axleCount: values.axleCount,
        remarks: values.remarks
      };
      
      console.log("Sending vehicle data as JSON:", vehicleData);
      
      if (vehicle) {
        updateWithoutFileMutation.mutate(vehicleData);
      } else {
        createWithoutFileMutation.mutate(vehicleData);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending || 
    createWithoutFileMutation.isPending || updateWithoutFileMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="relative w-full mx-auto">
        <div className="flex justify-between items-center py-1 px-3 border-b bg-primary text-white sticky top-0 z-10">
          <h2 className="text-xs font-medium">{vehicle ? "Editar Veículo" : "Cadastrar Novo Veículo"}</h2>
          <Button type="button" variant="ghost" size="icon" onClick={onCancel} className="h-5 w-5 text-white hover:bg-primary/90">
            <X className="h-3 w-3" />
          </Button>
        </div>
        
        <div className="p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="plate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm flex items-center">
                    Placa <span className="text-red-500 ml-1">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="" {...field} className="h-8 sm:h-9 text-sm" />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="renavam"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm flex items-center">
                    Renavam <span className="text-red-500 ml-1">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="" {...field} className="h-8 sm:h-9 text-sm" />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>
          
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs sm:text-sm flex items-center">
                  Tipo de Veículo <span className="text-red-500 ml-1">*</span>
                </FormLabel>
                <Select 
                  onValueChange={(value) => {
                    field.onChange(value);
                    setVehicleType(value);
                    
                    // Limpar campo carroceria se o novo tipo não for compatível
                    if (value !== "truck" && value !== "semi_trailer" && value !== "trailer") {
                      form.setValue("bodyType", "");
                    }
                  }} 
                  value={field.value}
                  defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="h-8 sm:h-9 text-sm">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {vehicleTypeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-sm">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          
          {/* Campo de tipo de carroceria - só aparece para tipos compatíveis */}
          {(vehicleType === "truck" || vehicleType === "semi_trailer" || vehicleType === "trailer") && (
            <FormField
              control={form.control}
              name="bodyType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm">
                    Tipo de Carroceria
                  </FormLabel>
                  <Select 
                    onValueChange={field.onChange}
                    value={field.value || ""}
                    defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-8 sm:h-9 text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {bodyTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-sm">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <FormField
              control={form.control}
              name="brand"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm flex items-center">
                    Marca <span className="text-red-500 ml-1">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="" {...field} className="h-8 sm:h-9 text-sm" />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm flex items-center">
                    Modelo <span className="text-red-500 ml-1">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="" {...field} className="h-8 sm:h-9 text-sm" />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="axleCount"
              render={({ field }) => (
                <FormItem className="col-span-2 md:col-span-1">
                  <FormLabel className="text-xs sm:text-sm flex items-center">
                    Qtd. Eixos <span className="text-red-500 ml-1">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="Mínimo 1" 
                      {...field} 
                      value={field.value || ''} 
                      onChange={(e) => {
                        const value = e.target.valueAsNumber;
                        field.onChange(value && value > 0 ? value : '');
                      }}
                      min="1"
                      className="h-8 sm:h-9 text-sm" 
                      required
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                  {field.value === 0 && (
                    <p className="text-xs text-red-500 mt-1">A quantidade de eixos não pode ser zero</p>
                  )}
                </FormItem>
              )}
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="tare"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm flex items-center">
                    Tara (kg) <span className="text-red-500 ml-1">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="Mínimo 1" 
                      {...field}
                      value={field.value || ''} 
                      onChange={(e) => {
                        const value = e.target.valueAsNumber;
                        field.onChange(value && value > 0 ? value : '');
                      }}
                      min="1"
                      className="h-8 sm:h-9 text-sm"
                      required
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                  {field.value === 0 && (
                    <p className="text-xs text-red-500 mt-1">O peso (TARA) não pode ser zero</p>
                  )}
                </FormItem>
              )}
            />
            
            {vehicleType === "tractor_unit" && (
              <FormItem>
                <FormLabel className="text-xs sm:text-sm">CMT (kg)</FormLabel>
                <Input 
                  type="number" 
                  placeholder="" 
                  value={cmt || ''} 
                  onChange={(e) => setCmt(e.target.valueAsNumber || undefined)}
                  className="h-8 sm:h-9 text-sm" 
                />
              </FormItem>
            )}
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <FormField
              control={form.control}
              name="year"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm flex items-center">
                    Ano de Fabricação <span className="text-red-500 ml-1">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="" 
                      {...field} 
                      value={field.value || ''} 
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      className="h-8 sm:h-9 text-sm" 
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="crlvYear"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs sm:text-sm">Ano CRLV</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="" 
                      {...field}
                      value={field.value || ''} 
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      className="h-8 sm:h-9 text-sm" 
                    />
                  </FormControl>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </div>
          
          <FormField
            control={form.control}
            name="remarks"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs sm:text-sm">Observações</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Observações sobre o veículo..." 
                    className="resize-none h-16 text-sm" 
                    {...field} 
                    value={field.value || ''} 
                  />
                </FormControl>
                <FormMessage className="text-xs" />
              </FormItem>
            )}
          />
          
          <div>
            <FormLabel htmlFor="crlvFile" className="text-xs sm:text-sm">Upload do CRLV (PDF/imagem)</FormLabel>
            <div className="flex justify-center px-2 py-2 border border-gray-300 border-dashed rounded-md">
              <div className="space-y-1 text-center">
                <UploadCloud className="mx-auto h-4 w-4 text-gray-400" />
                <div className="flex text-xs text-gray-600">
                  <label
                    htmlFor="crlvFile"
                    className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none"
                  >
                    <span>Carregar arquivo</span>
                    <input
                      id="crlvFile"
                      name="crlvFile"
                      type="file"
                      className="sr-only"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
                {file && (
                  <p className="text-xs text-green-600">
                    Arquivo: {file.name}
                  </p>
                )}
                {vehicle?.crlvUrl && !file && (
                  <p className="text-xs text-blue-600">
                    <a href={vehicle.crlvUrl} target="_blank" rel="noopener noreferrer">
                      Ver CRLV atual
                    </a>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2 py-2 px-3 border-t sticky bottom-0 z-10 bg-white">
          <Button type="button" variant="outline" onClick={onCancel} className="h-8 px-3 text-xs">
            Cancelar
          </Button>
          <Button type="submit" disabled={isSubmitting} className="h-8 px-3 bg-primary text-xs">
            {isSubmitting && <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />}
            {vehicle ? "Atualizar" : "Cadastrar Veículo"}
          </Button>
        </div>
      </form>
    </Form>
  );
}