import { Select as RadixSelect, Flex, Text } from "@radix-ui/themes";
import { cn } from "@app/utils/cn";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  size?: "1" | "2" | "3";
  variant?: "classic" | "surface" | "soft";
  labelPosition?: "top" | "left";
}

export function Select({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder = "Select an option...",
  className,
  size = "2",
  variant = "classic",
  labelPosition = "top",
}: SelectProps) {
  const selectComponent = (
    <RadixSelect.Root
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      size={size}
    >
      <RadixSelect.Trigger 
        className="w-full" 
        placeholder={placeholder}
        variant={variant}
      />
      <RadixSelect.Content>
        {options.map((option) => {
          return (
            <RadixSelect.Item key={option.value} value={option.value}>
              {option.label}
            </RadixSelect.Item>
          );
        })}
      </RadixSelect.Content>
    </RadixSelect.Root>
  );

  if (labelPosition === "left") {
    return (
      <Flex align="center" gap="3" className={cn(className)}>
        {label && (
          <Text size="2" weight="medium" className="text-gray-700" style={{ minWidth: "100px" }}>
            {label}:
          </Text>
        )}
        <div className="flex-1">
          {selectComponent}
        </div>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="2" className={cn(className)}>
      {label && (
        <Text size="2" weight="medium" className="text-gray-700">
          {label}
        </Text>
      )}
      {selectComponent}
    </Flex>
  );
}
