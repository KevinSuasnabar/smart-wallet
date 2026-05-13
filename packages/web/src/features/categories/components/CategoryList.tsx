import type {
  CategoryResponseDTO,
  PredefinedCategoryResponseDTO,
} from '@smart-wallet/shared-types';
import { CategoryItem } from './CategoryItem.js';

interface CategoryListProps {
  predefined: PredefinedCategoryResponseDTO[];
  custom: CategoryResponseDTO[];
  onDeleteCustom: (categoryId: string, name: string) => void;
}

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div className="mb-6">
    <h3 className="text-sm font-semibold text-muted-foreground mb-2">{title}</h3>
    <div className="rounded-xl border bg-card px-4">{children}</div>
  </div>
);

export const CategoryList = ({
  predefined,
  custom,
  onDeleteCustom,
}: CategoryListProps) => {
  const predefinedIncome = predefined.filter((c) => c.type === 'income');
  const predefinedExpense = predefined.filter((c) => c.type === 'expense');
  const customIncome = custom.filter((c) => c.type === 'income');
  const customExpense = custom.filter((c) => c.type === 'expense');

  return (
    <div>
      {(customIncome.length > 0 || customExpense.length > 0) && (
        <>
          <h2 className="text-base font-semibold mb-3">Personalizadas</h2>
          {customExpense.length > 0 && (
            <Section title="Gastos">
              {customExpense.map((c) => (
                <CategoryItem
                  key={c.categoryId}
                  name={c.name}
                  type={c.type}
                  isCustom
                  onDelete={() => onDeleteCustom(c.categoryId, c.name)}
                />
              ))}
            </Section>
          )}
          {customIncome.length > 0 && (
            <Section title="Ingresos">
              {customIncome.map((c) => (
                <CategoryItem
                  key={c.categoryId}
                  name={c.name}
                  type={c.type}
                  isCustom
                  onDelete={() => onDeleteCustom(c.categoryId, c.name)}
                />
              ))}
            </Section>
          )}
        </>
      )}

      <h2 className="text-base font-semibold mb-3">Predefinidas</h2>
      {predefinedExpense.length > 0 && (
        <Section title="Gastos">
          {predefinedExpense.map((c) => (
            <CategoryItem
              key={c.categoryId}
              name={c.name}
              type={c.type}
              isCustom={false}
            />
          ))}
        </Section>
      )}
      {predefinedIncome.length > 0 && (
        <Section title="Ingresos">
          {predefinedIncome.map((c) => (
            <CategoryItem
              key={c.categoryId}
              name={c.name}
              type={c.type}
              isCustom={false}
            />
          ))}
        </Section>
      )}
    </div>
  );
};
