# Context Providers Pattern

This document explains the standardized approach for handling context providers across the Semio Studio libraries, with generic utilities in `@semio/utils` and library-specific extensions in their respective packages.

## Architecture Overview

### Generic Utilities (`@semio/utils`)
- **Location**: `packages/utils/src/react/context-providers.tsx`
- **Purpose**: Framework-agnostic, reusable context patterns
- **Exports**: Core utilities like `createContextSolution`, `withOptionalContext`, etc.

### Library-Specific Extensions
- **UI Library**: Tooltip-specific utilities (`WithTooltipContextProps`)
- **Animation Library**: Animation-specific utilities (`WithAnimationContextProps`)
- **Scene Library**: Scene-specific utilities (`WithSceneContextProps`)
- **Vizij Library**: Vizij-specific utilities (`WithVizijContextProps`)

## Problem with Old Pattern

```tsx
// ❌ Old problematic pattern
export function MyComponent(props: MyProps) {
  const existingContext = useContext(MyContext);
  
  if (existingContext) {
    return <InnerComponent {...props} />;
  } else {
    return (
      <MyContext.Provider value={defaultStore}>
        <InnerComponent {...props} />
      </MyContext.Provider>
    );
  }
}
```

**Issues:**
- Conditional rendering causes React reconciliation problems
- Inconsistent implementation across components
- Hard to reason about what contexts will be available
- No way to override the behavior
- Complex nested conditional logic

## New Pattern

### Core Component + Wrapped Component

Split each component into two parts:

```tsx
// ✅ New pattern using utils
import { useOptionalContext } from '@semio/utils';
import { WithMyContextProps } from './utils/context-providers';

// 1. Core component that requires context
export const MyComponentCore = memo(function MyComponentCore(props: MyCoreProps) {
  // This component assumes context exists
  const store = useMyStore(); // Will throw if no context
  return <div>Component content</div>;
});

// 2. Full component with optional context provision
export function MyComponent({
  skipMyContext = false,
  ...props
}: MyComponentProps & WithMyContextProps) {
  const existingContext = useOptionalContext(MyContext);
  const needsContext = !skipMyContext && !existingContext;

  let content = <MyComponentCore {...props} />;

  if (needsContext) {
    content = (
      <MyContext.Provider value={defaultStore}>
        {content}
      </MyContext.Provider>
    );
  }

  return content;
}
```

### Using Generic Utilities

For maximum consistency, use the utilities from `@semio/utils`:

```tsx
import {
  createContextSolution,
  useOptionalContext,
  withOptionalContext
} from '@semio/utils';

// Create a complete context solution
const {
  useContext: useMyContext,
  Provider: MyProvider,
  withOptional: withOptionalMyContext,
  context: MyContext
} = createContextSolution({
  context: MyContext,
  defaultValue: defaultStore,
  name: 'MyContext'
});

// Use the HOC approach
const MyComponent = withOptionalMyContext(MyComponentCore);
```

## Library-Specific Context Props

### Animation Library (`@semio/animation`)

```tsx
import { WithAnimationContextProps, WithTooltipAndAnimationContextProps } from '@semio/animation';

interface MyAnimationComponentProps extends WithAnimationContextProps {
  skipAnimationContext?: boolean;
}

// For components that need both
interface MyComplexComponentProps extends WithTooltipAndAnimationContextProps {
  skipAnimationContext?: boolean;
  skipTooltipContext?: boolean;
}
```

### Scene Library (`@semio/scene`)

```tsx
import { WithSceneContextProps, WithTooltipAndSceneContextProps } from '@semio/scene';

interface MySceneComponentProps extends WithSceneContextProps {
  skipSceneContext?: boolean;
}
```

### UI Library (`@semio/ui`)

```tsx
import { WithTooltipContextProps } from '@semio/ui';

interface MyUIComponentProps extends WithTooltipContextProps {
  skipTooltipContext?: boolean;
}
```

### Vizij Library (`@semio/vizij`)

```tsx
import { WithVizijContextProps } from '@semio/vizij';

interface MyVizijComponentProps extends WithVizijContextProps {
  skipVizijContext?: boolean;
}
```

## Real Examples

### AnimationSheet3D (Migrated)

```tsx
import { useOptionalContext } from '@semio/utils';
import { TooltipProvider, TooltipHost, TooltipContext } from '@semio/ui';
import { WithTooltipAndAnimationContextProps } from '../utils/context-providers';

// Core component - requires contexts
export const AnimationSheet3DCore = memo(function AnimationSheet3DCore(
  props: AnimationSheet3DCoreProps,
) {
  // Assumes both contexts exist
  return <InnerSheet3D {...props} />;
});

// Full component - provides contexts if needed
export const AnimationSheet3D = memo(function AnimationSheet3D({
  skipTooltipContext = false,
  skipAnimationContext = false,
  ...props
}: AnimationSheet3DProps) {
  const animationCtx = useOptionalContext(AnimationContext);
  const tooltipCtx = useOptionalContext(TooltipContext);

  const needsAnimationContext = !skipAnimationContext && !animationCtx;
  const needsTooltipContext = !skipTooltipContext && !tooltipCtx;

  let content = <AnimationSheet3DCore {...props} />;

  if (needsAnimationContext) {
    content = (
      <AnimationContext.Provider value={useDefaultAnimationStore}>
        {content}
      </AnimationContext.Provider>
    );
  }

  if (needsTooltipContext) {
    content = (
      <TooltipProvider>
        <TooltipHost className="w-full h-full">{content}</TooltipHost>
      </TooltipProvider>
    );
  }

  return content;
});
```

### Scene Component (Migrated)

```tsx
import { useOptionalContext } from '@semio/utils';
import { WithSceneContextProps } from './utils/context-providers';

export const SceneCore = memo(function SceneCore(props: SceneCoreProps) {
  // Assumes SceneContext exists
  return <InnerScene {...props} />;
});

export function Scene({
  style,
  className,
  skipSceneContext = false,
  ...props
}: SceneProps) {
  const ctx = useOptionalContext(SceneContext);
  const needsSceneContext = !skipSceneContext && !ctx;

  let content = <SceneCore {...props} />;

  if (needsSceneContext) {
    content = <SceneContext.Provider value={useDefaultSceneStore}>{content}</SceneContext.Provider>;
  }

  // Handle styling separately from context logic
  if (style || className) {
    return <div style={style} className={className}>{content}</div>;
  }

  return content;
}
```

## Usage Patterns

### 1. Normal Usage (Auto Context)
```tsx
// Automatically provides context if needed
<AnimationSheet3D 
  namespaceId="demo"
  animationInstances={instances}
/>
```

### 2. Skip Context (Parent Provides)
```tsx
// Parent already provides context
<AnimationContext.Provider value={myStore}>
  <TooltipProvider>
    <AnimationSheet3D 
      skipAnimationContext
      skipTooltipContext
      namespaceId="demo"
      animationInstances={instances}
    />
  </TooltipProvider>
</AnimationContext.Provider>
```

### 3. Nested Components
```tsx
// Outer component provides contexts
<AnimationSheet3D namespaceId="outer" animationInstances={outer}>
  {/* Inner component skips contexts */}
  <AnimationSheet3D 
    skipAnimationContext 
    skipTooltipContext
    namespaceId="inner" 
    animationInstances={inner}
  />
</AnimationSheet3D>
```

### 4. Using Core Components Directly
```tsx
// When you know contexts are available
<AnimationContext.Provider value={store}>
  <TooltipProvider>
    <AnimationSheet3DCore 
      namespaceId="demo"
      animationInstances={instances}
    />
  </TooltipProvider>
</AnimationContext.Provider>
```

## Import Structure

### From `@semio/utils` (Generic)
```tsx
import {
  createContextSolution,
  withOptionalContext,
  createContextHook,
  createContextProvider,
  composeContexts,
  useOptionalContext,
  createContextChecker,
  type ContextConfig,
  type ContextSolutionConfig,
  type OptionalContextProps,
} from '@semio/utils';
```

### From Library-Specific Packages
```tsx
// Animation library
import { 
  WithAnimationContextProps,
  WithTooltipAndAnimationContextProps 
} from '@semio/animation';

// Scene library  
import { 
  WithSceneContextProps,
  WithTooltipAndSceneContextProps 
} from '@semio/scene';

// UI library
import { WithTooltipContextProps } from '@semio/ui';

// Vizij library
import { WithVizijContextProps } from '@semio/vizij';
```

## Migration Guide

### Step 1: Update Imports
Replace imports from `@semio/ui` context utilities with `@semio/utils` for generic utilities:

```tsx
// ❌ Old
import { useOptionalContext } from '@semio/ui';

// ✅ New  
import { useOptionalContext } from '@semio/utils';
```

### Step 2: Use Library-Specific Props
```tsx
// ❌ Old
import { WithAnimationContextProps } from '@semio/ui';

// ✅ New
import { WithAnimationContextProps } from '@semio/animation';
```

### Step 3: Split Components
1. Extract the core logic into a `*Core` component
2. Make the original component a wrapper that handles contexts

### Step 4: Test Both Patterns
1. Test with auto context provision
2. Test with explicit context skipping
3. Test nested scenarios

## Benefits

✅ **Separation of Concerns**: Generic utilities separate from library-specific ones
✅ **Predictable**: Clear separation between core logic and context provision
✅ **Flexible**: Can skip context provision when needed
✅ **Composable**: Easy to nest components without conflicts
✅ **Testable**: Core components can be tested in isolation
✅ **Consistent**: Same pattern across all libraries
✅ **Performance**: No conditional rendering reconciliation issues
✅ **Reusable**: Generic utilities can be used in any React project

## Best Practices

1. **Use `@semio/utils` for generic patterns** - Keep library-agnostic utilities in utils
2. **Library-specific extensions in their packages** - Each library defines its own context props
3. **Always provide Core and Full versions** of components that need context
4. **Use standard prop interfaces** (`WithTooltipContextProps`, etc.)
5. **Build content inside-out** rather than using conditional rendering
6. **Test both usage patterns** (auto context and skip context)
7. **Document context requirements** clearly in component docs
8. **Prefer explicit over implicit** - make context needs obvious