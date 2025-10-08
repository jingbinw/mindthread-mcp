declare module '@modelcontextprotocol/sdk/server' {
  export function createServer(opts: { name: string; version: string }): any;
}

declare module '@modelcontextprotocol/sdk/server/stdio' {
  export class StdioServerTransport {
    constructor();
  }
}

declare module '@modelcontextprotocol/sdk/server/index.js' {
  export function createServer(opts: { name: string; version: string }): any;
}

declare module '@modelcontextprotocol/sdk/server/stdio.js' {
  export class StdioServerTransport {
    constructor();
  }
}
