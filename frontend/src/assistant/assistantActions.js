/**
 * A central registry to link AI tool calls to React application state functions.
 * The main App component registers its state modifiers here.
 */
class AssistantActionRegistry {
  constructor() {
    this.actions = {};
    this.contextGetter = () => ({});
  }

  /**
   * Registers a UI action that the assistant can trigger.
   */
  registerAction(name, func) {
    this.actions[name] = func;
  }

  /**
   * Registers a function to retrieve the current UI context.
   */
  registerContextGetter(func) {
    this.contextGetter = func;
  }

  /**
   * Executes a registered action safely.
   */
  async execute(actionName, args = {}) {
    const action = this.actions[actionName];
    if (!action) {
      return { success: false, error: `Action '${actionName}' not found or not registered.` };
    }
    try {
      const result = await action(args);
      // Ensure we always return a structured response
      return result || { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Gets the current application state context.
   */
  getCurrentContext() {
    try {
      return this.contextGetter();
    } catch (err) {
      return { currentView: "unknown", error: err.message };
    }
  }
}

// Export a singleton instance
export const actionRegistry = new AssistantActionRegistry();
