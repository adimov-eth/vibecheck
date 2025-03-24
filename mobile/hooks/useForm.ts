import { handleError } from '@/utils/errorUtils';
import { useCallback, useState } from 'react';
import { z } from 'zod';

export interface FormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  isLoading: boolean;
  generalError: string;
}

export interface UseFormProps<T> {
  initialValues: T;
  validationSchema: z.ZodType<T>;
  onSubmit: (values: T) => Promise<void>;
}

export function useForm<T extends Record<string, unknown>>({
  initialValues,
  validationSchema,
  onSubmit
}: UseFormProps<T>) {
  const [formState, setFormState] = useState<FormState<T>>({
    values: initialValues,
    errors: {},
    isLoading: false,
    generalError: ''
  });

  const updateField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setFormState(prev => ({
      ...prev,
      values: { ...prev.values, [field]: value },
      errors: { ...prev.errors, [field]: '' },
      generalError: ''
    }));
  }, []);

  const validate = useCallback(async () => {
    try {
      await validationSchema.parseAsync(formState.values);
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof T, string>> = {};
        error.errors.forEach(err => {
          if (err.path.length > 0) {
            const field = err.path[0] as keyof T;
            fieldErrors[field] = err.message;
          }
        });
        setFormState(prev => ({
          ...prev,
          errors: fieldErrors
        }));
      }
      return false;
    }
  }, [formState.values, validationSchema]);

  const handleSubmit = useCallback(async () => {
    setFormState(prev => ({
      ...prev,
      isLoading: true,
      generalError: ''
    }));

    try {
      const isValid = await validate();
      if (!isValid) {
        return;
      }

      await onSubmit(formState.values);
    } catch (error) {
      const { message } = handleError(error, {
        defaultMessage: 'Form submission failed',
        serviceName: 'Form',
        showToast: true,
        onOtherError: () => {
          setFormState(prev => ({
            ...prev,
            generalError: message
          }));
        }
      });

      setFormState(prev => ({
        ...prev,
        generalError: message
      }));
    } finally {
      setFormState(prev => ({
        ...prev,
        isLoading: false
      }));
    }
  }, [formState.values, onSubmit, validate]);

  return {
    values: formState.values,
    errors: formState.errors,
    isLoading: formState.isLoading,
    generalError: formState.generalError,
    updateField,
    handleSubmit
  };
} 