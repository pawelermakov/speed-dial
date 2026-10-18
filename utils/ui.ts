// Shared layout classes; appearance is defined by semantic CSS tokens.
export const ui = {
  button: 'ui-button block w-full px-4 py-2 text-base leading-5 text-center transition-colors duration-250 motion-reduce:transition-none',
  input: 'ui-control relative block w-full max-w-full p-2 text-base leading-5 [&::-webkit-inner-spin-button]:h-full [&::-webkit-inner-spin-button]:absolute [&::-webkit-inner-spin-button]:top-0 [&::-webkit-inner-spin-button]:right-0 [&::-webkit-inner-spin-button]:opacity-100 [&::-webkit-outer-spin-button]:h-full [&::-webkit-outer-spin-button]:absolute [&::-webkit-outer-spin-button]:top-0 [&::-webkit-outer-spin-button]:right-0 [&::-webkit-outer-spin-button]:opacity-100',
  fileInput: 'peer absolute w-[0.1px] h-[0.1px] opacity-0 overflow-hidden -z-1',
  fileButton: 'ui-control ui-hover block w-[150px] min-h-9 leading-9 px-2 text-base text-center cursor-pointer transition-colors duration-250 motion-reduce:transition-none',
} as const;
