export const BrazilMapIcon = ({ className }: { className?: string }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24"
      width="20" 
      height="20" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
    >
      {/* Simplified outline of Brazil */}
      <path d="M7,5.5 C7,5.5 9,4 10.5,4 C12,4 13,4.5 14,5 C15,5.5 16.5,5.5 17,6.5 C17.5,7.5 18,9 18,9 L19,10 L20,12 L19,14 L18.5,16 L17,17.5 L14,19 L12,19.5 L10,19 L8,18.5 L6,17 L5,15 L4.5,13 L5,11 L5.5,9 L6,7 L7,5.5 Z" />
    </svg>
  );
};