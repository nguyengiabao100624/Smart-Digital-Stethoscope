import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      richColors
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          title: "group-[.toast]:text-foreground",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success:
            "group-[.toaster]:border-success/40 [&_[data-icon]]:text-success [&_svg]:text-success",
          warning:
            "group-[.toaster]:border-warning/45 [&_[data-icon]]:text-warning [&_svg]:text-warning",
          error:
            "group-[.toaster]:border-destructive/40 [&_[data-icon]]:text-destructive [&_svg]:text-destructive",
          info: "group-[.toaster]:border-info/40 [&_[data-icon]]:text-info [&_svg]:text-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
