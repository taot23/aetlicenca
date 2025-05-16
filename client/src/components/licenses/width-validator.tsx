import { useFormContext } from "react-hook-form";

interface WidthValidatorProps {
  licenseType: string;
  cargoType?: string;
}

/**
 * Componente para exibir a mensagem correta de largura máxima permitida
 * com base no tipo de conjunto e tipo de carga
 */
export function WidthValidator({ licenseType, cargoType }: WidthValidatorProps) {
  // Determinar a mensagem correta com base no tipo de conjunto
  let message = "";
  
  if (licenseType === 'flatbed') {
    if (cargoType === 'oversized') {
      // Para prancha com carga superdimensionada, não há limite específico
      return null;
    }
    // Para prancha com outros tipos de carga
    message = "A largura máxima permitida é 3,20 metros";
  } else {
    // Para todos os outros tipos de conjunto
    message = "A largura máxima permitida é 2,60 metros";
  }
  
  return (
    <div className="text-xs text-muted-foreground mt-1">
      {message}
    </div>
  );
}