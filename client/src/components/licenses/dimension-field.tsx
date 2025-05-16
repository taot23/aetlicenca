// Componente para campos de dimensão com tratamento inteligente para valores decimais
import { ChangeEvent, useState, useEffect, KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { FormControl, FormDescription, FormMessage, FormItem, FormLabel } from "@/components/ui/form";

// Interface para o componente de campo de dimensão
interface DimensionFieldProps {
  field: any;
  label: string;
  placeholder: string;
  description: string;
  fieldType?: "comprimento" | "largura" | "altura"; // Tipo de campo para comportamento específico
}

export function DimensionField({ 
  field, 
  label, 
  placeholder, 
  description, 
  fieldType = "comprimento" 
}: DimensionFieldProps) {
  const [displayValue, setDisplayValue] = useState<string>('');

  // Ao inicializar, converter o valor numérico para exibição
  useEffect(() => {
    if (displayValue === '' && typeof field.value === 'number') {
      setDisplayValue(field.value.toString().replace('.', ','));
    }
  }, [field.value, displayValue]);

  // Função para lidar com teclas especiais como backspace
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const selectionStart = input.selectionStart;
      const selectionEnd = input.selectionEnd;
      
      // Se temos uma seleção, deixa o comportamento padrão
      if (selectionStart !== selectionEnd) return;
      
      // Se o cursor está logo após a vírgula e estamos tentando apagar a vírgula
      if (selectionStart === displayValue.indexOf(',') + 1) {
        e.preventDefault();
        
        // Apagar o caractere antes da vírgula também (a vírgula + o número antes dela)
        const newValue = displayValue.substring(0, selectionStart - 2) + 
                         displayValue.substring(selectionStart);
        
        setDisplayValue(newValue);
        
        // Atualizar o valor no formulário
        updateFormValue(newValue);
        
        // Posicionar o cursor corretamente
        setTimeout(() => {
          input.setSelectionRange(selectionStart - 2, selectionStart - 2);
        }, 0);
      }
    }
  }

  // Função para tratar o evento onBlur (quando o campo perde o foco)
  function handleBlur() {
    document.body.classList.remove('keyboard-active');
    
    // Garante que um valor está definido quando o campo é obrigatório
    if (fieldType === "comprimento" && (!displayValue || displayValue === '')) {
      // Se for comprimento e o campo estiver vazio, definir o valor mínimo
      setDisplayValue('19,80');
      updateFormValue('19,80');
      return;
    }
    
    // Para campo de comprimento: adicionar zeros após vírgula se necessário
    if (fieldType === "comprimento" && displayValue.includes(',')) {
      const parts = displayValue.split(',');
      if (parts[1] === '') {
        // Se tem vírgula mas nada depois, adiciona "00"
        setDisplayValue(parts[0] + ',00');
        updateFormValue(parts[0] + ',00');
      } else if (parts[1].length === 1) {
        // Se tem só um dígito após a vírgula, adiciona um zero
        setDisplayValue(parts[0] + ',' + parts[1] + '0');
        updateFormValue(parts[0] + ',' + parts[1] + '0');
      }
    } else if (fieldType === "comprimento" && !displayValue.includes(',')) {
      // Se não tem vírgula, adicionar ,00
      setDisplayValue(displayValue + ',00');
      updateFormValue(displayValue + ',00');
    }
  }

  // Função para atualizar o valor no formulário
  function updateFormValue(value: string) {
    // Sanitizar para o modelo interno (sempre com ponto)
    const sanitized = value.replace(/,/g, '.').replace(/(\..*)\./g, '$1');
    
    // Converter para float (para o backend)
    const numericValue = sanitized === '' ? undefined : parseFloat(sanitized);
    
    // Atualizar o campo interno com o valor numérico
    field.onChange(numericValue);
  }

  // Função local para processar a entrada de dimensões
  function processInput(e: ChangeEvent<HTMLInputElement>) {
    // Campo inteligente para dimensões que aceita tanto ponto quanto vírgula
    let value = e.target.value;
    let cursorPos = e.target.selectionStart || 0;
    let valueChanged = false;
    
    // Limitar a digitação apenas a números, vírgula e ponto
    value = value.replace(/[^\d.,]/g, '');
    
    // Limitar a 5 caracteres no total (incluindo vírgula)
    if (value.length > 5) {
      value = value.substring(0, 5);
    }
    
    // Assegurar que só exista um separador decimal
    const hasComma = value.indexOf(',') !== -1;
    const hasDot = value.indexOf('.') !== -1;
    
    if (hasComma && hasDot) {
      // Se tiver ambos, remover o ponto
      value = value.replace(/\./g, '');
    }
    
    // Converter ponto para vírgula sempre (preferência formato brasileiro)
    if (hasDot) {
      value = value.replace('.', ',');
    }
    
    // Adicionar automaticamente vírgula baseado no tipo de campo
    if (fieldType === "comprimento") {
      // Para comprimento: adicionar vírgula após 2 dígitos
      if (value.length === 2 && !hasComma && !value.includes(',') && /^\d\d$/.test(value)) {
        value = value + ',';
        valueChanged = true;
        cursorPos = 3;
      }
    } else {
      // Para largura e altura: adicionar vírgula após 1 dígito
      if (value.length === 1 && !hasComma && !value.includes(',') && /^\d$/.test(value)) {
        value = value + ',';
        valueChanged = true;
        cursorPos = 2;
      }
    }
    
    // Limitar a 2 casas decimais durante a digitação
    if (value.indexOf(',') !== -1) {
      const parts = value.split(',');
      if (parts[1] && parts[1].length > 2) {
        parts[1] = parts[1].substring(0, 2);
        value = parts.join(',');
      }
    }
    
    // Atualizar o valor de exibição
    setDisplayValue(value);
    
    // Posicionar o cursor corretamente se o valor mudou
    if (valueChanged) {
      setTimeout(() => {
        e.target.setSelectionRange(cursorPos, cursorPos);
      }, 0);
    }
    
    // Atualizar o valor no formulário
    updateFormValue(value);
  }

  // Gerar ID único para o campo
  const fieldId = `${fieldType}_input_${field.name}`;
  
  // Verificar se o campo está vazio para mostrar alerta
  const isEmpty = field.value === undefined || field.value === null || field.value === '';
  
  return (
    <FormItem>
      <FormLabel htmlFor={fieldId} className="text-base font-medium flex items-center">
        {label}
        {isEmpty && (
          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
            Obrigatório
          </span>
        )}
      </FormLabel>
      <FormControl>
        <Input 
          id={fieldId}
          type="text" 
          inputMode="decimal"
          placeholder={placeholder}
          value={displayValue}
          className={`mobile-input h-10 ${isEmpty ? 'border-amber-500 focus:ring-amber-500' : ''}`}
          onFocus={(e) => {
            document.body.classList.add('keyboard-active');
            window.scrollTo(0, 0);
            setTimeout(() => {
              e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
          }}
          onBlur={handleBlur}
          onChange={processInput}
          onKeyDown={handleKeyDown}
        />
      </FormControl>
      {isEmpty && (
        <div className="mt-1 text-sm text-amber-600 font-medium">
          Este campo é obrigatório. Por favor, preencha um valor.
        </div>
      )}
      <FormDescription className="text-xs text-muted-foreground mt-1">
        {description}
      </FormDescription>
      <FormMessage />
    </FormItem>
  );
}