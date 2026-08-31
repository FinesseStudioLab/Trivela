/**
 * Tests for FormField component.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FormField, { FormFieldGroup, useFormValidation } from '../FormField.jsx';

describe('FormField', () => {
  describe('text input', () => {
    it('renders a text input with label', () => {
      render(
        <FormField
          type="text"
          label="Campaign Name"
          name="name"
          value=""
          onChange={() => {}}
        />
      );

      expect(screen.getByLabelText('Campaign Name')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('shows required indicator', () => {
      render(
        <FormField
          type="text"
          label="Campaign Name"
          name="name"
          value=""
          required
        />
      );

      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('shows error message', () => {
      render(
        <FormField
          type="text"
          label="Name"
          name="name"
          value=""
          error="Name is required"
        />
      );

      expect(screen.getByRole('alert')).toHaveTextContent('Name is required');
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    });

    it('shows warning message', () => {
      render(
        <FormField
          type="text"
          label="Slug"
          name="slug"
          value="test"
          warning="Changing this will break links"
        />
      );

      expect(screen.getByText('Changing this will break links')).toBeInTheDocument();
    });

    it('shows success message', () => {
      render(
        <FormField
          type="text"
          label="Slug"
          name="slug"
          value="unique-slug"
          success="Slug is available"
        />
      );

      expect(screen.getByText('Slug is available')).toBeInTheDocument();
    });

    it('shows hint text', () => {
      render(
        <FormField
          type="text"
          label="Name"
          name="name"
          value=""
          hint="Enter a descriptive name"
        />
      );

      expect(screen.getByText('Enter a descriptive name')).toBeInTheDocument();
    });
  });

  describe('number input', () => {
    it('renders a number input', () => {
      render(
        <FormField
          type="number"
          label="Reward"
          name="reward"
          value={25}
          min={0}
          max={100}
        />
      );

      const input = screen.getByRole('spinbutton');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue(25);
    });
  });

  describe('select', () => {
    it('renders a select with options', () => {
      render(
        <FormField
          type="select"
          label="Category"
          name="category"
          value=""
          options={[
            { value: 'defi', label: 'DeFi' },
            { value: 'nft', label: 'NFT' },
          ]}
        />
      );

      expect(screen.getByLabelText('Category')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'DeFi' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'NFT' })).toBeInTheDocument();
    });
  });

  describe('textarea', () => {
    it('renders a textarea', () => {
      render(
        <FormField
          type="textarea"
          label="Description"
          name="description"
          value=""
          rows={5}
        />
      );

      expect(screen.getByLabelText('Description')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('links error to input via aria-describedby', () => {
      render(
        <FormField
          type="text"
          label="Name"
          name="name"
          value=""
          error="Name is required"
        />
      );

      const input = screen.getByRole('textbox');
      const error = screen.getByRole('alert');
      expect(input).toHaveAttribute('aria-describedby', error.id);
    });

    it('links hint to input via aria-describedby', () => {
      render(
        <FormField
          type="text"
          label="Name"
          name="name"
          value=""
          hint="Enter name"
        />
      );

      const input = screen.getByRole('textbox');
      const hint = screen.getByText('Enter name');
      expect(input).toHaveAttribute('aria-describedby', hint.id);
    });

    it('sets aria-invalid when error is present', () => {
      render(
        <FormField
          type="text"
          label="Name"
          name="name"
          value=""
          error="Error"
        />
      );

      expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('disabled state', () => {
    it('disables the input', () => {
      render(
        <FormField
          type="text"
          label="Name"
          name="name"
          value=""
          disabled
        />
      );

      expect(screen.getByRole('textbox')).toBeDisabled();
    });
  });

  describe('events', () => {
    it('calls onChange', async () => {
      const handleChange = vi.fn();
      render(
        <FormField
          type="text"
          label="Name"
          name="name"
          value=""
          onChange={handleChange}
        />
      );

      await userEvent.type(screen.getByRole('textbox'), 'test');
      expect(handleChange).toHaveBeenCalled();
    });

    it('calls onBlur', async () => {
      const handleBlur = vi.fn();
      render(
        <FormField
          type="text"
          label="Name"
          name="name"
          value=""
          onBlur={handleBlur}
        />
      );

      await userEvent.click(screen.getByRole('textbox'));
      await userEvent.tab();
      expect(handleBlur).toHaveBeenCalled();
    });
  });
});

describe('FormFieldGroup', () => {
  it('renders a fieldset with legend', () => {
    render(
      <FormFieldGroup legend="Settings">
        <FormField type="text" label="Name" name="name" value="" />
      </FormFieldGroup>
    );

    expect(screen.getByRole('group', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});

describe('useFormValidation', () => {
  // Hook tests require a test component wrapper
  function TestComponent({ schema, initialValues, onSubmit }) {
    const { values, errors, handleChange, handleSubmit, getError } = useFormValidation({
      schema,
      initialValues,
      onSubmit,
    });

    return (
      <form onSubmit={handleSubmit}>
        <FormField
          type="text"
          label="Name"
          name="name"
          value={values.name || ''}
          onChange={handleChange}
          error={getError('name')}
        />
        <button type="submit">Submit</button>
      </form>
    );
  }

  it('manages form values', async () => {
    render(
      <TestComponent
        initialValues={{ name: 'test' }}
        onSubmit={() => {}}
      />
    );

    expect(screen.getByRole('textbox')).toHaveValue('test');
  });

  it('handles onChange', async () => {
    render(
      <TestComponent
        initialValues={{ name: '' }}
        onSubmit={() => {}}
      />
    );

    await userEvent.type(screen.getByRole('textbox'), 'new value');
    expect(screen.getByRole('textbox')).toHaveValue('new value');
  });
});
