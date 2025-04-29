import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Plus, MoreVertical, Edit, Trash, User as UserIcon } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { SkeletonTable } from "@/components/ui/skeleton-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { getRoleColor, getRoleLabel } from "@/lib/role-utils";

// Schema para validação do formulário base
const baseUserFormSchema = {
  fullName: z.string().min(3, "Nome completo deve ter pelo menos 3 caracteres"),
  email: z.string().email("Informe um email válido"),
  phone: z.string().min(8, "Telefone deve ter pelo menos 8 caracteres"),
  role: z.string()
};

// Schema para criação (com senha obrigatória)
const createUserFormSchema = z.object({
  ...baseUserFormSchema,
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres"),
});

// Schema para edição (com senha opcional)
const updateUserFormSchema = z.object({
  ...baseUserFormSchema,
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres").optional().or(z.literal('')),
});

type CreateUserFormValues = z.infer<typeof createUserFormSchema>;
type UpdateUserFormValues = z.infer<typeof updateUserFormSchema>;
type UserFormValues = CreateUserFormValues | UpdateUserFormValues;

interface User {
  id: number;
  email: string;
  fullName: string;
  phone: string;
  role: string;
  isAdmin: boolean;
  createdAt: string;
}

export default function AdminUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Fetch users
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/users");
      return await response.json();
    }
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      toast({
        title: "Usuário excluído",
        description: "O usuário foi excluído com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir usuário",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // User form for create/edit
  const UserForm = ({ user, onSuccess }: { user?: User, onSuccess?: () => void }) => {
    const form = useForm<UserFormValues>({
      resolver: zodResolver(user ? updateUserFormSchema : createUserFormSchema),
      defaultValues: user ? {
        fullName: user.fullName,
        email: user.email,
        password: "",
        phone: user.phone,
        role: user.role
      } : {
        fullName: "",
        email: "",
        password: "",
        phone: "",
        role: "user"
      }
    });

    // Create user mutation
    const createUserMutation = useMutation({
      mutationFn: async (data: UserFormValues) => {
        const response = await apiRequest("POST", "/api/admin/users", data);
        return await response.json();
      },
      onSuccess: () => {
        toast({
          title: "Usuário criado",
          description: "O usuário foi criado com sucesso",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        onSuccess?.();
      },
      onError: (error: Error) => {
        toast({
          title: "Erro ao criar usuário",
          description: error.message,
          variant: "destructive",
        });
      }
    });

    // Update user mutation
    const updateUserMutation = useMutation({
      mutationFn: async (data: UserFormValues) => {
        if (!user) throw new Error("Usuário não encontrado");
        const response = await apiRequest("PATCH", `/api/admin/users/${user.id}`, data);
        return await response.json();
      },
      onSuccess: () => {
        toast({
          title: "Usuário atualizado",
          description: "O usuário foi atualizado com sucesso",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
        onSuccess?.();
      },
      onError: (error: Error) => {
        toast({
          title: "Erro ao atualizar usuário",
          description: error.message,
          variant: "destructive",
        });
      }
    });

    const onSubmit = (data: UserFormValues) => {
      if (user) {
        // Se estiver editando e a senha estiver vazia, remova o campo password
        if (data.password === '') {
          const { password, ...restData } = data;
          updateUserMutation.mutate(restData as UpdateUserFormValues);
        } else {
          updateUserMutation.mutate(data);
        }
      } else {
        createUserMutation.mutate(data as CreateUserFormValues);
      }
    };

    const isPending = createUserMutation.isPending || updateUserMutation.isPending;

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="email@exemplo.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{user ? "Nova senha (deixe em branco para manter)" : "Senha"}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="********" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input placeholder="(00) 00000-0000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Função</FormLabel>
                <FormControl>
                  <select 
                    className="w-full p-2 border rounded" 
                    {...field}
                  >
                    <option value="user">Transportador</option>
                    <option value="operational">Operacional</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="manager">Gerente</option>
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end mt-6">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Processando...</span>
                </>
              ) : user ? (
                "Atualizar Usuário"
              ) : (
                "Cadastrar Usuário"
              )}
            </Button>
          </div>
        </form>
      </Form>
    );
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setIsEditDialogOpen(true);
  };

  const handleDeleteUser = (userId: number) => {
    if (confirm("Tem certeza que deseja excluir este usuário?")) {
      deleteUserMutation.mutate(userId);
    }
  };

  const renderUsersList = () => {
    if (isLoading) {
      return <SkeletonTable columns={5} rows={5} />;
    }

    if (users.length === 0) {
      return (
        <Alert className="my-4">
          <AlertDescription>
            Nenhum usuário cadastrado. Clique no botão "Novo" para adicionar.
          </AlertDescription>
        </Alert>
      );
    }

    if (isMobile) {
      return (
        <div className="space-y-4">
          {users.filter((user: User) => !user.isAdmin).map((user: User) => (
            <Card key={user.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="p-4 bg-gray-50 flex justify-between items-center">
                  <div>
                    <h3 className="font-medium">{user.fullName}</h3>
                    <p className="text-xs text-gray-500">ID: {user.id}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditUser(user)}>
                        <Edit size={16} className="mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDeleteUser(user.id)} className="text-red-600">
                        <Trash size={16} className="mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Email:</span>
                    <span className="text-sm">{user.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Telefone:</span>
                    <span className="text-sm">{user.phone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Função:</span>
                    <Badge variant="outline" className={`bg-${getRoleColor(user.role)}-50 text-${getRoleColor(user.role)}-700 border-${getRoleColor(user.role)}-200`}>
                      {getRoleLabel(user.role)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Nome</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>Função</TableHead>
            <TableHead className="w-[100px]">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.filter((user: User) => !user.isAdmin).map((user: User) => (
            <TableRow key={user.id}>
              <TableCell>{user.id}</TableCell>
              <TableCell className="font-medium">{user.fullName}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.phone}</TableCell>
              <TableCell>
                <Badge variant="outline" className={`bg-${getRoleColor(user.role)}-50 text-${getRoleColor(user.role)}-700 border-${getRoleColor(user.role)}-200`}>
                  {getRoleLabel(user.role)}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEditUser(user)}>
                      <Edit size={16} className="mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDeleteUser(user.id)} className="text-red-600">
                      <Trash size={16} className="mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <AdminLayout>
      <div className="container mx-auto py-6 max-w-6xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Gerenciar Usuários</h1>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus size={16} className="mr-2" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Novo Usuário</DialogTitle>
              </DialogHeader>
              <UserForm 
                onSuccess={() => {
                  setIsCreateDialogOpen(false);
                }} 
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Lista de usuários */}
        {renderUsersList()}

        {/* Modal de edição de usuário */}
        {selectedUser && (
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Editar Usuário</DialogTitle>
              </DialogHeader>
              <UserForm 
                user={selectedUser} 
                onSuccess={() => {
                  setIsEditDialogOpen(false);
                  setSelectedUser(null);
                }} 
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AdminLayout>
  );
}