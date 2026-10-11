// Shared Tailwind utilities; keep complete class names so the compiler can detect them.
export const ui = {
  "button": "block w-full border border-[#ffcc00] rounded-[5px] bg-[#ffcc00] px-3 py-[0.375rem] text-base leading-[1.5] text-center text-[#212529] enabled:hover:bg-[#f2c200] enabled:hover:border-[#f2c200] transition-all duration-250 ease-in-out motion-reduce:transition-none",
  "input": "relative block w-full max-w-full border border-[#ced4da] rounded-[5px] bg-white p-2 text-base leading-[normal] text-[#212529] [&::-webkit-inner-spin-button]:h-full [&::-webkit-inner-spin-button]:absolute [&::-webkit-inner-spin-button]:top-0 [&::-webkit-inner-spin-button]:right-0 [&::-webkit-inner-spin-button]:opacity-100 [&::-webkit-outer-spin-button]:h-full [&::-webkit-outer-spin-button]:absolute [&::-webkit-outer-spin-button]:top-0 [&::-webkit-outer-spin-button]:right-0 [&::-webkit-outer-spin-button]:opacity-100",
  "fileInput": "peer absolute w-[0.1px] h-[0.1px] opacity-0 overflow-hidden -z-1",
  "fileButton": "block w-[150px] h-8 leading-8 bg-white rounded-[5px] border border-[#ced4da] px-2 text-base text-[#212529] text-center cursor-pointer hover:bg-[#ffeba0] peer-focus-visible:outline peer-focus-visible:outline-[#54565a] peer-focus-visible:outline-offset-2 transition-all duration-250 ease-in-out motion-reduce:transition-none"
} as const;
