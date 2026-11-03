---
title: Accordion
description: A vertically stacked set of interactive headings that each reveal a section of content.
base: base
component: true
links:
  doc: https://base-ui.com/react/components/accordion
  api: https://base-ui.com/react/components/accordion#api-reference
---

Some examples also use `card`. Install the ones you need with `quint ui-components add card --install`.


```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '../ui/accordion'

export function AccordionDemo() {
  return (
    <Accordion defaultValue={['shipping']} className="max-w-lg">
      <AccordionItem value="shipping">
        <AccordionTrigger>What are your shipping options?</AccordionTrigger>
        <AccordionContent>
          We offer standard (5-7 days), express (2-3 days), and overnight shipping. Free shipping on
          international orders.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="returns">
        <AccordionTrigger>What is your return policy?</AccordionTrigger>
        <AccordionContent>
          Returns accepted within 30 days. Items must be unused and in original packaging. Refunds
          processed within 5-7 business days.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="support">
        <AccordionTrigger>How can I contact customer support?</AccordionTrigger>
        <AccordionContent>
          Reach us via email, live chat, or phone. We respond within 24 hours during business days.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
```

## Installation

Use `quint ui-components add accordion --install`.

## Usage

```tsx showLineNumbers
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '../ui/accordion'
```

```tsx showLineNumbers
<Accordion defaultValue={['item-1']}>
  <AccordionItem value="item-1">
    <AccordionTrigger>Is it accessible?</AccordionTrigger>
    <AccordionContent>Yes. It adheres to the WAI-ARIA design pattern.</AccordionContent>
  </AccordionItem>
</Accordion>
```

## Composition

Use the following composition to build an `Accordion`:

```text
Accordion
├── AccordionItem
│   ├── AccordionTrigger
│   └── AccordionContent
└── AccordionItem
    ├── AccordionTrigger
    └── AccordionContent
```

## Basic

A basic accordion that shows one item at a time. The first item is open by default.

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '../ui/accordion'

const items = [
  {
    value: 'item-1',
    trigger: 'How do I reset my password?',
    content:
      "Click on 'Forgot Password' on the login page, enter your email address, and we'll send you a link to reset your password. The link will expire in 24 hours."
  },
  {
    value: 'item-2',
    trigger: 'Can I change my subscription plan?',
    content:
      'Yes, you can upgrade or downgrade your plan at any time from your account settings. Changes will be reflected in your next billing cycle.'
  },
  {
    value: 'item-3',
    trigger: 'What payment methods do you accept?',
    content:
      'We accept all major credit cards, PayPal, and bank transfers. All payments are processed securely through our payment partners.'
  }
]

export function AccordionBasic() {
  return (
    <Accordion defaultValue={['item-1']} className="max-w-lg">
      {items.map(item => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.trigger}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
```

## Multiple

Use the `multiple` prop to allow multiple items to be open at the same time.

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '../ui/accordion'

const items = [
  {
    value: 'notifications',
    trigger: 'Notification Settings',
    content:
      'Manage how you receive notifications. You can enable email alerts for updates or push notifications for mobile devices.'
  },
  {
    value: 'privacy',
    trigger: 'Privacy & Security',
    content:
      'Control your privacy settings and security preferences. Enable two-factor authentication, manage connected devices, review active sessions, and configure data sharing preferences. You can also download your data or delete your account.'
  },
  {
    value: 'billing',
    trigger: 'Billing & Subscription',
    content:
      'View your current plan, payment history, and upcoming invoices. Update your payment method, change your subscription tier, or cancel your subscription.'
  }
]

export function AccordionMultiple() {
  return (
    <Accordion multiple className="max-w-lg" defaultValue={['notifications']}>
      {items.map(item => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.trigger}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
```

## Disabled

Use the `disabled` prop on `AccordionItem` to disable individual items.

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '../ui/accordion'

export function AccordionDisabled() {
  return (
    <Accordion className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger>Can I access my account history?</AccordionTrigger>
        <AccordionContent>
          Yes, you can view your complete account history including all transactions, plan changes,
          and support tickets in the Account History section of your dashboard.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2" disabled>
        <AccordionTrigger>Premium feature information</AccordionTrigger>
        <AccordionContent>
          This section contains information about premium features. Upgrade your plan to access this
          content.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-3">
        <AccordionTrigger>How do I update my email address?</AccordionTrigger>
        <AccordionContent>
          You can update your email address in your account settings. You&apos;ll receive a
          verification email at your new address to confirm the change.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
```

## Borders

Add `border` to the `Accordion` and `border-b last:border-b-0` to the `AccordionItem` to add borders to the items.

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '../ui/accordion'

const items = [
  {
    value: 'billing',
    trigger: 'How does billing work?',
    content:
      'We offer monthly and annual subscription plans. Billing is charged at the beginning of each cycle, and you can cancel anytime. All plans include automatic backups, 24/7 support, and unlimited team members.'
  },
  {
    value: 'security',
    trigger: 'Is my data secure?',
    content:
      'Yes. We use end-to-end encryption, SOC 2 Type II compliance, and regular third-party security audits. All data is encrypted at rest and in transit using industry-standard protocols.'
  },
  {
    value: 'integration',
    trigger: 'What integrations do you support?',
    content:
      'We integrate with 500+ popular tools including Slack, Zapier, Salesforce, HubSpot, and more. You can also build custom integrations using our REST API and webhooks.'
  }
]

export function AccordionBorders() {
  return (
    <Accordion className="max-w-lg rounded-lg border" defaultValue={['billing']}>
      {items.map(item => (
        <AccordionItem
          key={item.value}
          value={item.value}
          className="border-b px-4 last:border-b-0"
        >
          <AccordionTrigger>{item.trigger}</AccordionTrigger>
          <AccordionContent>{item.content}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
```

## Card

Wrap the `Accordion` in a `Card` component.

```tsx
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '../ui/accordion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

const items = [
  {
    value: 'plans',
    trigger: 'What subscription plans do you offer?',
    content:
      'We offer three subscription tiers: Starter ($9/month), Professional ($29/month), and Enterprise ($99/month). Each plan includes increasing storage limits, API access, priority support, and team collaboration features.'
  },
  {
    value: 'billing',
    trigger: 'How does billing work?',
    content:
      "Billing occurs automatically at the start of each billing cycle. We accept all major credit cards, PayPal, and ACH transfers for enterprise customers. You'll receive an invoice via email after each payment."
  },
  {
    value: 'cancel',
    trigger: 'How do I cancel my subscription?',
    content:
      'You can cancel your subscription anytime from your account settings. There are no cancellation fees or penalties. Your access will continue until the end of your current billing period.'
  }
]

export function AccordionCard() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Subscription & Billing</CardTitle>
        <CardDescription>
          Common questions about your account, plans, payments and cancellations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion defaultValue={['plans']}>
          {items.map(item => (
            <AccordionItem key={item.value} value={item.value}>
              <AccordionTrigger>{item.trigger}</AccordionTrigger>
              <AccordionContent>{item.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}
```

## API Reference

See the [Base UI](https://base-ui.com/react/components/accordion#api-reference) documentation for more information.
