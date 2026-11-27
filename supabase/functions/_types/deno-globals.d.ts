// Tipos mínimos de Deno para revisar las Edge Functions con `tsc -p tsconfig.functions.json`.
// No se importa desde las funciones: en Supabase corre el runtime de Deno real con sus propios tipos.
declare namespace Deno {
  const env: { get(name: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}
