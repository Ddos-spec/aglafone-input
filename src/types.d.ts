declare module "react-hook-form" {
  export type FieldValues = Record<string, any>;
  export type UseFormReturn<TFieldValues = FieldValues> = {
    control: any;
    register: (name: any, options?: any) => any;
    handleSubmit: (fn: (data: TFieldValues) => void) => (e?: any) => void;
    reset: (values?: Partial<TFieldValues>) => void;
    setValue: (name: any, value: any) => void;
    watch: (...args: any[]) => any;
    getValues: (...args: any[]) => any;
  };
  export type UseFieldArrayReturn<TFieldValues = FieldValues> = {
    fields: any[];
    append: (value: any) => void;
    remove: (index: number) => void;
    update: (index: number, value: any) => void;
  };
  export function useForm<TFieldValues = FieldValues>(
    options?: any,
  ): UseFormReturn<TFieldValues>;
  export function useFieldArray<TFieldValues = FieldValues, TName extends string = string>(
    args: any,
  ): UseFieldArrayReturn<TFieldValues>;
}
