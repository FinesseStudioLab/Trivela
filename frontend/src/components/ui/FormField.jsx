/**
 * FormField — shared design-system form input with validation states.
 *
 * Implements accessible form fields:
 *   - Text, number, email, password, select, textarea inputs
 *   - Validation states: error, warning, success
 *   - Integrated with Zod validation library
 *   - Keyboard accessible with proper focus management
 *   - Screen-reader accessible with aria-describedby for errors
 *
 * Usage:
 *   <FormField
 *     label="Campaign Name"
 *     name="name"
 *     value={values.name}
 *     onChange={handleChange}
 *     error={errors.name}
 *     required
 *   />
 *
 *   <FormField
 *     type="select"
 *     label="Category"
 *     name="category"
 *     value={values.category}
 *     onChange={handleChange}
 *     options={[
 *       { value: 'defi', label: 'DeFi' },
 *       { value: 'nft', label: 'NFT' },
 *     ]}
 *   />
 *
 *   // With Zod validation
 *   <FormField
 *     label="Reward Amount"
 *     type="number"
 *     name="rewardPerAction"
 *     value={values.rewardPerAction}
 *     onChange={handleChange}
 *     error={zodErrors.rewardPerAction?.message}
 *   />
 */

import { useCallback, useId, useState } from 'react';
import './tokens.css';
import './FormField.css';

/**
 * FormField — accessible, themeable form input with validation.
 */
export default function FormField({
  type = 'text',
  label,
  name,
  value,
  onChange,
  onBlur,
  placeholder,
  error,
  warning,
  success,
  hint,
  required = false,
  disabled = false,
  readOnly = false,
  autoComplete,
  autoFocus = false,
  min,
  max,
  step,
  minLength,
  maxLength,
  pattern,
  options,
  rows = 4,
  className = '',
  inputClassName = '',
  'aria-describedby': ariaDescribedBy,
  ...rest
}) {
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const warningId = useId();
  const successId = useId();

  // Build aria-describedby
  const describedBy = [
    ariaDescribedBy,
    hint && hintId,
    error && errorId,
    warning && warningId,
    success && successId,
  ]
    .filter(Boolean)
    .join(' ');

  const hasValidation = error || warning || success;
  const validationState = error ? 'error' : warning ? 'warning' : success ? 'success' : null;

  const commonProps = {
    id: inputId,
    name,
    value,
    onChange,
    onBlur,
    disabled,
    readOnly,
    autoFocus,
    required,
    'aria-describedby': describedBy || undefined,
    'aria-invalid': error ? true : undefined,
    className: `ds-field__input ds-field__input--${type} ${inputClassName}`.trim(),
    ...rest,
  };

  const renderInput = () => {
    switch (type) {
      case 'select':
        return (
          <select {...commonProps}>
            {placeholder && (
              <option value="" disabled={required}>
                {placeholder}
              </option>
            )}
            {options?.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'textarea':
        return (
          <textarea
            {...commonProps}
            rows={rows}
            minLength={minLength}
            maxLength={maxLength}
            placeholder={placeholder}
          />
        );

      default:
        return (
          <input
            {...commonProps}
            type={type}
            placeholder={placeholder}
            autoComplete={autoComplete}
            min={min}
            max={max}
            step={step}
            minLength={minLength}
            maxLength={maxLength}
            pattern={pattern}
          />
        );
    }
  };

  return (
    <div
      className={`ds-field ${hasValidation ? `ds-field--${validationState}` : ''} ${className}`.trim()}
      data-disabled={disabled || undefined}
    >
      {label && (
        <label htmlFor={inputId} className="ds-field__label">
          {label}
          {required && (
            <span className="ds-field__required" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}

      <div className="ds-field__input-wrapper">
        {renderInput()}

        {success && !error && !warning && (
          <span className="ds-field__icon ds-field__icon--success" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
        )}

        {error && (
          <span className="ds-field__icon ds-field__icon--error" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </span>
        )}
      </div>

      {/* Hint text */}
      {hint && !error && !warning && !success && (
        <p id={hintId} className="ds-field__hint">
          {hint}
        </p>
      )}

      {/* Error message */}
      {error && (
        <p id={errorId} className="ds-field__error" role="alert">
          {error}
        </p>
      )}

      {/* Warning message */}
      {warning && !error && (
        <p id={warningId} className="ds-field__warning">
          {warning}
        </p>
      )}

      {/* Success message */}
      {success && !error && !warning && (
        <p id={successId} className="ds-field__success">
          {success}
        </p>
      )}
    </div>
  );
}

/**
 * FormFieldGroup — container for grouping related fields.
 */
export function FormFieldGroup({ children, legend, className = '' }) {
  return (
    <fieldset className={`ds-field-group ${className}`.trim()}>
      {legend && <legend className="ds-field-group__legend">{legend}</legend>}
      {children}
    </fieldset>
  );
}

/**
 * useFormValidation — hook for integrating Zod schemas with form validation.
 *
 * Usage:
 *   const { values, errors, handleChange, validate, handleSubmit } = useFormValidation({
 *     schema: campaignCreateSchema,
 *     initialValues: { name: '', rewardPerAction: 0 },
 *     onSubmit: async (values) => { ... },
 *   });
 */
export function useFormValidation({ schema, initialValues = {}, onSubmit }) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = useCallback(
    (event) => {
      const { name, value, type } = event.target;
      const parsedValue = type === 'number' ? parseFloat(value) || 0 : value;

      setValues((prev) => ({ ...prev, [name]: parsedValue }));

      // Clear error on change
      if (errors[name]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [errors],
  );

  const handleBlur = useCallback((event) => {
    const { name } = event.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
  }, []);

  const validate = useCallback(
    (fieldNames) => {
      if (!schema) return true;

      const fieldsToValidate = fieldNames || Object.keys(values);
      const partialValues = fieldsToValidate.reduce(
        (acc, key) => {
          if (key in values) acc[key] = values[key];
          return acc;
        },
        {},
      );

      const result = schema.safeParse(partialValues);

      if (result.success) {
        setErrors({});
        return true;
      }

      const newErrors = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path.join('.');
        if (fieldsToValidate.includes(path) || !fieldNames) {
          newErrors[path] = issue;
        }
      });

      setErrors(newErrors);
      return false;
    },
    [schema, values],
  );

  const handleSubmit = useCallback(
    async (event) => {
      event?.preventDefault();

      const isValid = validate();
      if (!isValid) return;

      setIsSubmitting(true);
      try {
        await onSubmit(values);
      } finally {
        setIsSubmitting(false);
      }
    },
    [validate, onSubmit, values],
  );

  const reset = useCallback(() => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  }, [initialValues]);

  const setFieldValue = useCallback((name, value) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const setFieldError = useCallback((name, error) => {
    setErrors((prev) => ({ ...prev, [name]: error }));
  }, []);

  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    validate,
    handleSubmit,
    reset,
    setFieldValue,
    setFieldError,
    getError: (name) => {
      const error = errors[name];
      return error?.message || null;
    },
    getFieldProps: (name) => ({
      name,
      value: values[name] ?? '',
      onChange: handleChange,
      onBlur: handleBlur,
      error: errors[name]?.message,
    }),
  };
}
