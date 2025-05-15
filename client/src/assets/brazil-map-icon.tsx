export const BrazilMapIcon = ({ className }: { className?: string }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 400 400"
      width="20" 
      height="20" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="8" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
    >
      {/* Brazil map outline based on provided image */}
      <path d="M109,77 L88,84 L75,103 L61,93 L54,102 L61,115 L56,133 L72,143 L75,163 L93,177 L91,193 L103,209 L119,210 L125,225 L144,231 L135,248 L147,253 L156,247 L168,253 L190,256 L208,250 L226,257 L242,275 L280,300 L308,270 L335,255 L340,234 L326,219 L312,216 L299,199 L304,180 L293,166 L325,136 L326,98 L307,74 L269,56 L236,61 L219,54 L211,61 L185,53 L144,60 L129,72 L109,77 Z" />
    </svg>
  );
};