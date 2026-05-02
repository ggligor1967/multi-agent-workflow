// Shared Select component mock for jsdom tests.
// Usage from client/src/pages/*.test.ts:
//   vi.mock("@/components/ui/select", () => import("./__test-helpers__/select-mock"));

import React from "react";

type SelectContextValue = {
  value: string;
  items: Map<string, string>;
  registerItem: (value: string, label: string) => void;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext() {
  const context = React.useContext(SelectContext);
  if (!context) {
    throw new Error("Select components must be used inside Select");
  }
  return context;
}

function Select({ value = "", children }: { value?: string; children: React.ReactNode }) {
  const [items, setItems] = React.useState<Map<string, string>>(new Map());

  const registerItem = React.useCallback((itemValue: string, label: string) => {
    setItems((previous) => {
      if (previous.get(itemValue) === label) {
        return previous;
      }

      const next = new Map(previous);
      next.set(itemValue, label);
      return next;
    });
  }, []);

  const contextValue = React.useMemo(
    () => ({ value, items, registerItem }),
    [items, registerItem, value]
  );

  return React.createElement(SelectContext.Provider, { value: contextValue }, children);
}

function SelectTrigger({
  children,
  id,
  disabled,
}: {
  children: React.ReactNode;
  id?: string;
  disabled?: boolean;
}) {
  return React.createElement("button", { type: "button", id, disabled }, children);
}

function SelectValue({ placeholder }: { placeholder?: string }) {
  const context = useSelectContext();
  const label = context.items.get(context.value) ?? placeholder ?? "";
  return React.createElement("span", null, label);
}

function SelectContent({ children }: { children: React.ReactNode }) {
  return React.createElement("div", { hidden: true }, children);
}

function SelectItem({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const context = useSelectContext();
  const label = typeof children === "string" ? children : String(children ?? "");

  React.useEffect(() => {
    context.registerItem(value, label);
  }, [context, label, value]);

  return null;
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
