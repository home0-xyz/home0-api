# MCP Servers Configuration

This project includes two Cloudflare MCP (Model Context Protocol) servers that enhance AI assistant capabilities when working with Cloudflare services.

## Available MCP Servers

### 1. Cloudflare Documentation Server
- **Purpose**: Search and retrieve Cloudflare documentation
- **URL**: https://docs.mcp.cloudflare.com
- **Tool**: `search_cloudflare_documentation`
- **Use cases**:
  - Finding information about Cloudflare services
  - Getting API documentation
  - Understanding Workers, D1, R2, KV features

### 2. Cloudflare Workers Bindings Server
- **Purpose**: Manage Cloudflare resources programmatically
- **URL**: https://bindings.mcp.cloudflare.com
- **Authentication**: OAuth (browser-based)
- **Supported operations**:
  - **Accounts**: List accounts, set active account
  - **KV Namespaces**: List, create, delete, get details
  - **Workers**: List workers, get worker details, retrieve code
  - **R2 Buckets**: List, create, delete, get details
  - **D1 Databases**: List, create, delete, query databases
  - **Hyperdrive**: List, create, edit, delete configurations

## Usage with AI Assistants

### For Claude Desktop or MCP-compatible clients:

1. Point your client to the `mcp.json` configuration file in this project
2. The client will load both MCP servers automatically
3. On first use of the bindings server, you'll be prompted to authenticate via browser

### Example prompts for the bindings server:

```
"List all my D1 databases"
"Show me the R2 buckets in my account"
"Get the code for my 'zillow-data-collector' worker"
"Create a new KV namespace called 'property-cache'"
"Query the zillow-data-db D1 database to show all collections"
```

### Example prompts for the docs server:

```
"How do I use Cloudflare D1 with Workers?"
"What are the pricing details for Workers?"
"Show me how to configure R2 bucket CORS"
"Explain Workers Analytics Engine"
```

## Authentication Notes

- The documentation server requires no authentication
- The bindings server uses Cloudflare OAuth:
  - On first use, it will open your browser for login
  - Authentication persists across sessions
  - Works with your Cloudflare account permissions

## Troubleshooting

If you encounter connection issues:

1. Ensure you have `mcp-remote` installed: `npm install --save-dev mcp-remote`
2. Check your internet connection
3. For the bindings server, ensure you've completed OAuth authentication
4. Try testing the connection: `npx mcp-remote <server-url> --test`

## Security Considerations

- The bindings server has full access to your Cloudflare resources
- Only use with trusted AI assistants
- OAuth tokens are managed securely by the MCP protocol
- Consider using API tokens with limited scopes for production use