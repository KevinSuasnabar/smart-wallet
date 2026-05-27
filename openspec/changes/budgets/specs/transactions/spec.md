# Transactions — Delta Specification (budgets change)

## ADDED Requirements

### Requirement: Expense Period Sum

The `TransactionRepository` MUST expose a new read method `sumExpensesByPeriod(userId, { from, to, currency, categoryId? })` that returns the total cents of expense transactions for the given user within the half-open UTC interval `[from, to)`, filtered by currency, and optionally by categoryId.

- The method MUST return a non-negative integer (cents).
- The method MUST drain all DynamoDB pages (follow `LastEvaluatedKey` until exhausted).
- The method MUST include only transactions where `type = expense`.
- The method MUST NOT modify the `Transaction` aggregate, its value objects, or its mappers.

#### Scenario: Sum expenses for a category in a period

- GIVEN a user with 3 expense transactions in category C (currency USD) in January, and 2 in February
- WHEN `sumExpensesByPeriod(userId, { from: Jan1, to: Feb1, currency: 'USD', categoryId: C })` is called
- THEN the return value equals the sum of the 3 January transactions in cents

#### Scenario: Sum all expenses globally (no categoryId)

- GIVEN a user with 5 expense transactions (currency EUR) in January across different categories, and 2 income transactions
- WHEN `sumExpensesByPeriod(userId, { from: Jan1, to: Feb1, currency: 'EUR' })` is called
- THEN the return value equals the sum of only the 5 expense transactions (income excluded)

#### Scenario: No matching transactions returns zero

- GIVEN a user with no transactions in the requested period and currency
- WHEN `sumExpensesByPeriod` is called
- THEN the return value is 0

#### Scenario: Multi-page result is fully drained

- GIVEN the DDB query returns results across multiple pages (LastEvaluatedKey present)
- WHEN `sumExpensesByPeriod` is called
- THEN all pages are consumed and the total reflects ALL matching transactions
