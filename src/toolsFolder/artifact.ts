import { Tool } from "@modelcontextprotocol/sdk/types.js";

// In-memory storage for artifacts (in production, use a database)
const artifacts = new Map<string, {
  id: string;
  title: string;
  type: string;
  language?: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
}>();

export const tool: Tool = {
  name: "manage_artifact",
  description: "Create, update, retrieve, or delete code artifacts and documents",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "update", "get", "delete", "list"],
        description: "Action to perform on the artifact"
      },
      id: {
        type: "string",
        description: "Unique identifier for the artifact (required for update, get, delete)"
      },
      title: {
        type: "string",
        description: "Title of the artifact (required for create)"
      },
      type: {
        type: "string",
        enum: ["code", "html", "markdown", "react", "svg"],
        description: "Type of artifact (required for create)"
      },
      language: {
        type: "string",
        description: "Programming language (for code type artifacts)"
      },
      content: {
        type: "string",
        description: "Content of the artifact (required for create and update)"
      }
    },
    required: ["action"]
  }
};

export const handler = async (args: any, userId?: string) => {
  const { action, id, title, type, language, content } = args;
  const userPrefix = userId ? `[User: ${userId}] ` : "";

  try {
    switch (action) {
      case "create": {
        if (!title || !type || !content) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}Error: Missing required fields for create action. Need: title, type, content`
            }]
          };
        }

        const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const artifact = {
          id: artifactId,
          title,
          type,
          language: language || undefined,
          content,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId
        };

        artifacts.set(artifactId, artifact);

        return {
          content: [{
            type: "text",
            text: `${userPrefix}✅ Artifact created successfully!\n\n` +
                  `**ID:** ${artifactId}\n` +
                  `**Title:** ${title}\n` +
                  `**Type:** ${type}\n` +
                  `**Language:** ${language || 'N/A'}\n` +
                  `**Created:** ${artifact.createdAt.toISOString()}\n\n` +
                  `**Content Preview:**\n\`\`\`${language || ''}\n${content.slice(0, 200)}${content.length > 200 ? '...' : ''}\n\`\`\``
          }]
        };
      }

      case "update": {
        if (!id) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}Error: Artifact ID is required for update action`
            }]
          };
        }

        const artifact = artifacts.get(id);
        if (!artifact) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}Error: Artifact with ID '${id}' not found`
            }]
          };
        }

        // Check if user owns this artifact (optional security check)
        if (userId && artifact.userId && artifact.userId !== userId) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}Error: You don't have permission to update this artifact`
            }]
          };
        }

        // Update fields if provided
        if (title) artifact.title = title;
        if (type) artifact.type = type;
        if (language) artifact.language = language;
        if (content) artifact.content = content;
        artifact.updatedAt = new Date();

        artifacts.set(id, artifact);

        return {
          content: [{
            type: "text",
            text: `${userPrefix}✅ Artifact updated successfully!\n\n` +
                  `**ID:** ${id}\n` +
                  `**Title:** ${artifact.title}\n` +
                  `**Type:** ${artifact.type}\n` +
                  `**Last Updated:** ${artifact.updatedAt.toISOString()}\n\n` +
                  `**Updated Content Preview:**\n\`\`\`${artifact.language || ''}\n${artifact.content.slice(0, 200)}${artifact.content.length > 200 ? '...' : ''}\n\`\`\``
          }]
        };
      }

      case "get": {
        if (!id) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}Error: Artifact ID is required for get action`
            }]
          };
        }

        const artifact = artifacts.get(id);
        if (!artifact) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}Error: Artifact with ID '${id}' not found`
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text: `${userPrefix}📄 **Artifact Details**\n\n` +
                  `**ID:** ${artifact.id}\n` +
                  `**Title:** ${artifact.title}\n` +
                  `**Type:** ${artifact.type}\n` +
                  `**Language:** ${artifact.language || 'N/A'}\n` +
                  `**Created:** ${artifact.createdAt.toISOString()}\n` +
                  `**Updated:** ${artifact.updatedAt.toISOString()}\n` +
                  `**Owner:** ${artifact.userId || 'Anonymous'}\n\n` +
                  `**Full Content:**\n\`\`\`${artifact.language || ''}\n${artifact.content}\n\`\`\``
          }]
        };
      }

      case "delete": {
        if (!id) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}Error: Artifact ID is required for delete action`
            }]
          };
        }

        const artifact = artifacts.get(id);
        if (!artifact) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}Error: Artifact with ID '${id}' not found`
            }]
          };
        }

        // Check if user owns this artifact (optional security check)
        if (userId && artifact.userId && artifact.userId !== userId) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}Error: You don't have permission to delete this artifact`
            }]
          };
        }

        artifacts.delete(id);

        return {
          content: [{
            type: "text",
            text: `${userPrefix}🗑️ Artifact '${artifact.title}' (${id}) deleted successfully!`
          }]
        };
      }

      case "list": {
        const userArtifacts = Array.from(artifacts.values())
          .filter(artifact => !userId || !artifact.userId || artifact.userId === userId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

        if (userArtifacts.length === 0) {
          return {
            content: [{
              type: "text",
              text: `${userPrefix}📋 No artifacts found.`
            }]
          };
        }

        const artifactList = userArtifacts.map(artifact => 
          `• **${artifact.title}** (${artifact.id})\n` +
          `  Type: ${artifact.type}${artifact.language ? ` (${artifact.language})` : ''}\n` +
          `  Updated: ${artifact.updatedAt.toISOString()}\n`
        ).join('\n');

        return {
          content: [{
            type: "text",
            text: `${userPrefix}📋 **Your Artifacts** (${userArtifacts.length} total)\n\n${artifactList}`
          }]
        };
      }

      default:
        return {
          content: [{
            type: "text",
            text: `${userPrefix}Error: Unknown action '${action}'. Available actions: create, update, get, delete, list`
          }]
        };
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `${userPrefix}Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      }]
    };
  }
};

