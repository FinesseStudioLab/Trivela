import FormField, { FormFieldGroup, useFormValidation } from '../components/ui/FormField.jsx';
import { useState } from 'react';

export default {
  title: 'Design System/FormField',
  component: FormField,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Accessible, themeable form fields with validation states. Supports text, number, email, ' +
          'password, select, and textarea inputs. Wired to Zod validation library.',
      },
    },
  },
  argTypes: {
    type: {
      control: 'inline-radio',
      options: ['text', 'email', 'password', 'number', 'select', 'textarea'],
    },
    required: { control: 'boolean' },
    disabled: { control: 'boolean' },
    onChange: { action: 'changed' },
    onBlur: { action: 'blurred' },
  },
};

export const Text = {
  args: {
    type: 'text',
    label: 'Campaign Name',
    name: 'name',
    value: '',
    placeholder: 'Enter campaign name',
    hint: 'Choose a descriptive name for your campaign',
  },
};

export const Required = {
  args: {
    type: 'text',
    label: 'Campaign Name',
    name: 'name',
    value: '',
    placeholder: 'Required field',
    required: true,
  },
};

export const WithError = {
  args: {
    type: 'text',
    label: 'Campaign Name',
    name: 'name',
    value: '',
    error: 'Name is required and must be at least 3 characters',
  },
};

export const WithWarning = {
  args: {
    type: 'text',
    label: 'Campaign Slug',
    name: 'slug',
    value: 'my-campaign',
    warning: 'Changing the slug will break existing links',
  },
};

export const WithSuccess = {
  args: {
    type: 'text',
    label: 'Campaign Slug',
    name: 'slug',
    value: 'my-awesome-campaign',
    success: 'Slug is available',
  },
};

export const NumberField = {
  args: {
    type: 'number',
    label: 'Reward Per Action',
    name: 'rewardPerAction',
    value: 25,
    min: 0,
    max: 1000,
    step: 1,
    hint: 'Points awarded for each completed action',
  },
};

export const NumberWithError = {
  args: {
    type: 'number',
    label: 'Reward Per Action',
    name: 'rewardPerAction',
    value: -5,
    error: 'Reward must be a non-negative number',
  },
};

export const Email = {
  args: {
    type: 'email',
    label: 'Email Address',
    name: 'email',
    value: '',
    placeholder: 'you@example.com',
    autoComplete: 'email',
  },
};

export const Password = {
  args: {
    type: 'password',
    label: 'Password',
    name: 'password',
    value: '',
    placeholder: 'Enter password',
    hint: 'Must be at least 8 characters',
  },
};

export const Select = {
  args: {
    type: 'select',
    label: 'Category',
    name: 'category',
    value: '',
    placeholder: 'Select a category',
    options: [
      { value: 'defi', label: 'DeFi' },
      { value: 'nft', label: 'NFT' },
      { value: 'community', label: 'Community' },
      { value: 'airdrop', label: 'Airdrop' },
    ],
  },
};

export const SelectWithError = {
  args: {
    type: 'select',
    label: 'Category',
    name: 'category',
    value: '',
    placeholder: 'Select a category',
    error: 'Please select a category',
    options: [
      { value: 'defi', label: 'DeFi' },
      { value: 'nft', label: 'NFT' },
      { value: 'community', label: 'Community' },
      { value: 'airdrop', label: 'Airdrop' },
    ],
  },
};

export const Textarea = {
  args: {
    type: 'textarea',
    label: 'Description',
    name: 'description',
    value: '',
    placeholder: 'Describe your campaign...',
    rows: 4,
    maxLength: 500,
  },
};

export const Disabled = {
  args: {
    type: 'text',
    label: 'Disabled Field',
    name: 'disabled',
    value: 'Cannot edit this',
    disabled: true,
  },
};

export const ReadOnly = {
  args: {
    type: 'text',
    label: 'Read-Only Field',
    name: 'readonly',
    value: 'Contract ID: CABC123...',
    readOnly: true,
    hint: 'Copied to clipboard on click',
  },
};

function ValidationDemo() {
  const [values, setValues] = useState({
    name: '',
    rewardPerAction: '',
    category: '',
  });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const validate = (name, value) => {
    switch (name) {
      case 'name':
        if (!value.trim()) return 'Name is required';
        if (value.length < 3) return 'Name must be at least 3 characters';
        if (value.length > 50) return 'Name must be at most 50 characters';
        return null;
      case 'rewardPerAction':
        if (!value) return 'Reward is required';
        if (parseFloat(value) < 0) return 'Reward must be non-negative';
        if (parseFloat(value) > 1000) return 'Reward cannot exceed 1000';
        return null;
      case 'category':
        if (!value) return 'Please select a category';
        return null;
      default:
        return null;
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (touched[name]) {
      setErrors((prev) => ({ ...prev, [name]: validate(name, value) }));
    }
  };

  const handleBlur = (e) => {
    const { name, value } = e.target;
    setTouched((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: validate(name, value) }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const newErrors = {};
        Object.keys(values).forEach((key) => {
          const error = validate(key, values[key]);
          if (error) newErrors[key] = error;
        });
        setErrors(newErrors);
        if (Object.keys(newErrors).length === 0) {
          alert('Form submitted successfully!');
        }
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '400px' }}
    >
      <FormField
        type="text"
        label="Campaign Name"
        name="name"
        value={values.name}
        onChange={handleChange}
        onBlur={handleBlur}
        error={errors.name}
        required
      />
      <FormField
        type="number"
        label="Reward Per Action"
        name="rewardPerAction"
        value={values.rewardPerAction}
        onChange={handleChange}
        onBlur={handleBlur}
        error={errors.rewardPerAction}
        min={0}
        max={1000}
        required
      />
      <FormField
        type="select"
        label="Category"
        name="category"
        value={values.category}
        onChange={handleChange}
        onBlur={handleBlur}
        error={errors.category}
        options={[
          { value: 'defi', label: 'DeFi' },
          { value: 'nft', label: 'NFT' },
          { value: 'community', label: 'Community' },
          { value: 'airdrop', label: 'Airdrop' },
        ]}
        required
      />
      <button type="submit" className="btn btn-primary">
        Submit
      </button>
    </form>
  );
}

export const WithValidation = {
  render: () => <ValidationDemo />,
  parameters: {
    docs: {
      description: {
        story: 'Form fields with real-time validation. Errors appear on blur and clear on change.',
      },
    },
  },
};

export const FieldGroup = {
  render: () => (
    <FormFieldGroup legend="Campaign Settings" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <FormField type="text" label="Campaign Name" name="name" value="" />
      <FormField type="number" label="Reward" name="reward" value={0} min={0} />
      <FormField type="select" label="Category" name="category" value="" options={[
        { value: 'defi', label: 'DeFi' },
        { value: 'nft', label: 'NFT' },
      ]} />
    </FormFieldGroup>
  ),
  parameters: {
    docs: {
      description: {
        story: 'Group related fields with a shared legend using FormFieldGroup.',
      },
    },
  },
};

export const LightTheme = {
  args: {
    type: 'text',
    label: 'Campaign Name',
    name: 'name',
    value: 'My Campaign',
  },
  globals: { theme: 'light' },
};
