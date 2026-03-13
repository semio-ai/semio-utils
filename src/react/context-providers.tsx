import { type ReactNode, type ComponentType, type Context, useContext, createElement } from "react";

/**
 * Configuration for a context provider
 */
export interface ContextConfig<T> {
  /** The React context */
  context: Context<T | null>;
  /** Default store/value to provide when context is missing */
  defaultValue: T;
  /** Name for error messages */
  name: string;
}

/**
 * Props for components that can optionally provide their own context
 */
export interface OptionalContextProps {
  /** Whether to skip providing context (assume parent provides it) */
  skipContext?: boolean;
}

/**
 * Creates a hook that requires context to be present
 */
export function createContextHook<T>(context: Context<T | null>, name: string) {
  return function useRequiredContext(): T {
    const value = useContext(context);
    if (!value) {
      throw new Error(
        `${name} context is required. Make sure you're using the component within a ${name}Provider.`,
      );
    }
    return value;
  };
}

/**
 * Creates a component that provides context if not already present
 */
export function withOptionalContext<P extends object>(
  CoreComponent: ComponentType<P>,
  contextConfig: ContextConfig<any>,
): ComponentType<P & OptionalContextProps> {
  const { context, defaultValue } = contextConfig;

  return function ComponentWithContext(props: P & OptionalContextProps) {
    const { skipContext = false, ...coreProps } = props;
    const existingContext = useContext(context);

    // If skipContext is true or context already exists, render core component directly
    if (skipContext || existingContext) {
      return createElement(CoreComponent, coreProps as P);
    }

    // Otherwise, provide the default context
    return createElement(
      context.Provider,
      { value: defaultValue },
      createElement(CoreComponent, coreProps as P),
    );
  };
}

/**
 * Composes multiple context providers into a single component
 */
export function composeContexts(
  contexts: {
    Provider: ComponentType<{ children: ReactNode }>;
    condition?: () => boolean;
  }[],
): ComponentType<{ children: ReactNode }> {
  return function ComposedContexts({ children }: { children: ReactNode }) {
    return contexts.reduceRight((acc, { Provider, condition }) => {
      // Only wrap if condition is not provided or returns true
      if (condition && !condition()) {
        return acc;
      }
      return createElement(Provider as ComponentType<any>, {}, acc);
    }, children as ReactNode);
  };
}

/**
 * Creates a provider component for a context
 */
export function createContextProvider<T>(
  context: Context<T | null>,
  defaultValue: T,
): ComponentType<{ children: ReactNode; value?: T }> {
  return function ContextProvider({
    children,
    value = defaultValue,
  }: {
    children: ReactNode;
    value?: T;
  }) {
    return createElement(context.Provider, { value }, children);
  };
}

/**
 * Utility type for extracting context value type
 */
export type ContextValue<T> = T extends Context<infer U> ? U : never;

/**
 * Configuration for creating a complete context solution
 */
export interface ContextSolutionConfig<T> {
  /** The React context */
  context: Context<T | null>;
  /** Default store/value */
  defaultValue: T;
  /** Name for debugging and errors */
  name: string;
}

/**
 * Creates a complete context solution with consistent patterns
 */
export function createContextSolution<T>(config: ContextSolutionConfig<T>) {
  const { context, defaultValue, name } = config;

  // Hook that requires context
  const useRequiredContext = createContextHook(context, name);

  // Provider component
  const Provider = createContextProvider(context, defaultValue);

  // HOC for optional context
  const withOptional = <P extends object>(Component: ComponentType<P>) =>
    withOptionalContext(Component, config);

  return {
    useContext: useRequiredContext,
    Provider,
    withOptional,
    context: config.context,
  };
}

/**
 * Standard interface for components that might need tooltip context
 */
export interface WithTooltipContextProps {
  /** Skip providing tooltip context (assume parent provides) */
  skipTooltipContext?: boolean;
}

/**
 * Utility for checking if context exists without throwing
 */
export function useOptionalContext<T>(context: Context<T | null>): T | null {
  return useContext(context);
}

/**
 * Creates a context checker function
 */
export function createContextChecker<T>(context: Context<T | null>) {
  return function useHasContext(): boolean {
    return useContext(context) !== null;
  };
}
