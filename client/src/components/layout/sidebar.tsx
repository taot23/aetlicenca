import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { 
  Menu, 
  Home, 
  Truck, 
  FileText, 
  ClipboardList, 
  ListChecks, 
  LogOut, 
  ChevronRight, 
  Building2, 
  ClipboardEdit,
  LayoutDashboard,
  Users,
  Settings,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/ui/logo";
import { Separator } from "@/components/ui/separator";

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.isAdmin;
  const isSupervisor = isAdmin || user?.role === 'supervisor';
  const isOperational = isSupervisor || user?.role === 'operational';
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const userInitials = user?.fullName
    .split(' ')
    .map(name => name[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const handleNavigate = (path: string) => {
    // Verifica se já está na mesma página para evitar recargas desnecessárias
    if (location !== path) {
      setLocation(path);
    }
    setOpen(false);
  };

  const NavItems = () => (
    <>
      <div className="flex items-center justify-center h-16 px-4 bg-gray-900">
        <Logo width={120} className="py-2" />
      </div>
      
      <div className="px-2 py-4 space-y-1">
        {/* Seção do Usuário Regular - Dashboard é visível apenas para usuários não-administrativos */}
        {!isOperational && (
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-white hover:bg-gray-700",
              (location === "/" || location === "/dashboard") ? "bg-gray-700" : "bg-transparent"
            )}
            onClick={() => handleNavigate("/")}
          >
            <Home className="mr-3 h-5 w-5" />
            Dashboard
          </Button>
        )}
        
        {/* Minhas Empresas é visível apenas para usuários não-administrativos */}
        {!isOperational && (
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-white hover:bg-gray-700",
              location === "/my-companies" ? "bg-gray-700" : "bg-transparent"
            )}
            onClick={() => handleNavigate("/my-companies")}
          >
            <Building2 className="mr-3 h-5 w-5" />
            Minhas Empresas
          </Button>
        )}
        
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-white hover:bg-gray-700",
            location === "/vehicles" ? "bg-gray-700" : "bg-transparent"
          )}
          onClick={() => handleNavigate("/vehicles")}
        >
          <Truck className="mr-3 h-5 w-5" />
          Veículos Cadastrados
        </Button>
        
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-white hover:bg-gray-700",
            location === "/request-license" ? "bg-gray-700" : "bg-transparent"
          )}
          onClick={() => handleNavigate("/request-license")}
        >
          <FileText className="mr-3 h-5 w-5" />
          Solicitar Licença
        </Button>
        
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-white hover:bg-gray-700",
            location === "/track-license" ? "bg-gray-700" : "bg-transparent"
          )}
          onClick={() => handleNavigate("/track-license")}
        >
          <ClipboardList className="mr-3 h-5 w-5" />
          Acompanhar Licença
        </Button>
        
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start text-white hover:bg-gray-700",
            location === "/issued-licenses" ? "bg-gray-700" : "bg-transparent"
          )}
          onClick={() => handleNavigate("/issued-licenses")}
        >
          <ListChecks className="mr-3 h-5 w-5" />
          Licenças Emitidas
        </Button>
        
        {/* Seção de Funcionalidades Administrativas */}
        {(isAdmin || isSupervisor || isOperational) && (
          <>
            <div className="pt-2 pb-2">
              <Separator className="bg-gray-700" />
              <p className="text-xs text-gray-400 uppercase mt-2 ml-2 font-semibold">Administração</p>
            </div>
            
            {isAdmin && (
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-white hover:bg-gray-700",
                  location === "/admin" ? "bg-gray-700" : "bg-transparent"
                )}
                onClick={() => handleNavigate("/admin")}
              >
                <LayoutDashboard className="mr-3 h-5 w-5" />
                Relatórios
              </Button>
            )}
            
            {isOperational && (
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-white hover:bg-gray-700",
                  (location === "/admin/licenses" || location === "/gerenciar-licencas") ? "bg-gray-700" : "bg-transparent"
                )}
                onClick={() => handleNavigate("/admin/licenses")}
              >
                <ClipboardEdit className="mr-3 h-5 w-5" />
                Gerenciar Licenças
              </Button>
            )}
            
            {isOperational && (
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-white hover:bg-gray-700",
                  location === "/admin/transporters" ? "bg-gray-700" : "bg-transparent"
                )}
                onClick={() => handleNavigate("/admin/transporters")}
              >
                <Building2 className="mr-3 h-5 w-5" />
                Transportadores
              </Button>
            )}
            
            {isAdmin && (
              <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start text-white hover:bg-gray-700",
                  location === "/admin/users" ? "bg-gray-700" : "bg-transparent"
                )}
                onClick={() => handleNavigate("/admin/users")}
              >
                <Users className="mr-3 h-5 w-5" />
                Usuários
              </Button>
            )}
            
            {/* Botão de todos veículos para usuários operacionais removido */}

            {/* Botão de atualizar página */}
            <Button
              variant="outline"
              className="w-full justify-start bg-white text-gray-800 hover:bg-gray-100 mt-4"
              onClick={() => {
                window.location.reload();
              }}
            >
              <RefreshCw className="mr-3 h-5 w-5" />
              Atualizar Dados
            </Button>
          </>
        )}
      </div>
      
      <div className="p-4 border-t border-gray-700">
        <div className="flex items-center">
          <Avatar className="h-10 w-10 bg-gray-500">
            <AvatarFallback className="text-black font-medium">{userInitials}</AvatarFallback>
          </Avatar>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">{user?.fullName}</p>
            <p className="text-xs text-gray-300">
              {user?.email}
              {isAdmin && <span className="ml-1 bg-blue-600 text-white text-[10px] px-1 py-0.5 rounded">Admin</span>}
              {user?.role === 'supervisor' && <span className="ml-1 bg-green-600 text-white text-[10px] px-1 py-0.5 rounded">Supervisor</span>}
              {user?.role === 'operational' && <span className="ml-1 bg-orange-600 text-white text-[10px] px-1 py-0.5 rounded">Operacional</span>}
            </p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="ml-auto text-gray-300 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </>
  );

  return isMobile ? (
    <>
      <div className="md:hidden fixed inset-x-0 top-0 z-20 bg-gray-900 text-white flex items-center justify-between h-16 px-4 shadow-md">
        <div className="flex items-center">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white p-2 mr-2">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 bg-gray-800 text-white w-[280px] overflow-y-auto max-h-screen">
              <NavItems />
            </SheetContent>
          </Sheet>
          <Logo width={90} className="ml-1" />
        </div>
        <div className="flex items-center">
          <Avatar className="h-8 w-8 bg-gray-700">
            <AvatarFallback className="text-black font-medium">{userInitials}</AvatarFallback>
          </Avatar>
        </div>
      </div>
      <div className="pt-16 md:pt-0"></div>
    </>
  ) : (
    <div className={cn("hidden md:flex md:flex-col md:w-64 fixed inset-y-0 bg-gray-800 text-white shadow-lg z-10", className)}>
      <NavItems />
    </div>
  );
}
