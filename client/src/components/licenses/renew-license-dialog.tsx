import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useWebSocketContext } from "@/hooks/use-websocket-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatShortDate } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface RenewLicenseDialogProps {
  isOpen: boolean;
  onClose: () => void;
  licenseId: number;
  state: string;
  currentValidityDate?: string | null;
}

export function RenewLicenseDialog({
  isOpen,
  onClose,
  licenseId,
  state,
  currentValidityDate
}: RenewLicenseDialogProps) {
  const { toast } = useToast();
  const { sendMessage } = useWebSocketContext();
  const queryClient = useQueryClient();
  const [date, setDate] = useState<Date | undefined>(
    currentValidityDate ? new Date(currentValidityDate) : undefined
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const renewMutation = useMutation({
    mutationFn: async (newDate: string) => {
      const res = await apiRequest("POST", `/api/licenses/${licenseId}/renew`, {
        state,
        validityDate: newDate
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Licença renovada",
        description: `Licença #${licenseId} renovada para o estado ${state} até ${formatShortDate(date)}`,
        variant: "default"
      });
      
      // Enviar atualização via WebSocket
      sendMessage({
        type: "STATUS_UPDATE",
        data: {
          licenseId,
          state,
          status: "approved",
          license: data
        }
      });
      
      // Invalidar consultas para forçar atualização dos dados
      queryClient.invalidateQueries({ queryKey: ["/api/licenses"] });
      queryClient.invalidateQueries({ queryKey: [`/api/licenses/${licenseId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/licenses/issued"] });
      
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Erro ao renovar licença",
        description: error.message || "Ocorreu um erro ao renovar a licença",
        variant: "destructive"
      });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!date) {
      toast({
        title: "Data inválida",
        description: "Por favor, selecione uma data de validade",
        variant: "destructive"
      });
      return;
    }
    
    // Formatar data para YYYY-MM-DD
    const formattedDate = format(date, "yyyy-MM-dd");
    renewMutation.mutate(formattedDate);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Renovar Licença</DialogTitle>
          <DialogDescription>
            Informe a nova data de validade para a licença #{licenseId} no estado {state}.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="validityDate">Data de Validade</Label>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={`w-full justify-start text-left font-normal ${
                    !date && "text-muted-foreground"
                  }`}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP", { locale: pt }) : "Selecione uma data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(date) => {
                    setDate(date);
                    setIsCalendarOpen(false);
                  }}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={renewMutation.isPending || !date}
            >
              {renewMutation.isPending ? "Processando..." : "Renovar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}