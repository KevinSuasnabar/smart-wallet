import type {
  CategoryResponseDTO,
  PredefinedCategoryResponseDTO,
} from '@smart-wallet/shared-types';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
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
  <div>
    <Eyebrow className="mb-2 block px-1">{title}</Eyebrow>
    <div className="rounded-md border border-border bg-card px-4">
      {children}
    </div>
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

  const hasCustom = customIncome.length > 0 || customExpense.length > 0;

  return (
    <div className="flex flex-col gap-8">
      {hasCustom && (
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-bold tracking-tightest">
            Personalizadas
          </h2>
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
        </div>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold tracking-tightest">Predefinidas</h2>
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
    </div>
  );
};
