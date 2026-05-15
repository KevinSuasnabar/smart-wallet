import type {
  CategoryResponseDTO,
  PredefinedCategoryResponseDTO,
} from '@smart-wallet/shared-types';
import { Eyebrow } from '../../../components/common/Eyebrow.js';
import { CategoryItem } from './CategoryItem.js';

export type CategoryEditTarget = {
  categoryId: string;
  name: string;
  type: 'income' | 'expense';
  color: string;
  kind: 'custom' | 'predefined';
};

interface CategoryListProps {
  predefined: PredefinedCategoryResponseDTO[];
  custom: CategoryResponseDTO[];
  onEdit: (target: CategoryEditTarget) => void;
  onDelete: (target: { categoryId: string; name: string; kind: 'custom' | 'predefined' }) => void;
}

const Section = ({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-2xl font-bold tracking-display">{title}</h2>
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{children}</div>
  </section>
);

export const CategoryList = ({
  predefined,
  custom,
  onEdit,
  onDelete,
}: CategoryListProps) => {
  const hasCustom = custom.length > 0;

  return (
    <div className="flex flex-col gap-10">
      {hasCustom && (
        <Section eyebrow="Tuyas" title="Personalizadas">
          {custom.map((c) => (
            <CategoryItem
              key={c.categoryId}
              categoryId={c.categoryId}
              name={c.name}
              type={c.type}
              color={c.color}
              onEdit={() =>
                onEdit({
                  categoryId: c.categoryId,
                  name: c.name,
                  type: c.type,
                  color: c.color,
                  kind: 'custom',
                })
              }
              onDelete={() =>
                onDelete({
                  categoryId: c.categoryId,
                  name: c.name,
                  kind: 'custom',
                })
              }
            />
          ))}
        </Section>
      )}

      <Section eyebrow="Del sistema" title="Predefinidas">
        {predefined.map((c) => (
          <CategoryItem
            key={c.categoryId}
            categoryId={c.categoryId}
            name={c.name}
            type={c.type}
            color={c.color}
            onEdit={() =>
              onEdit({
                categoryId: c.categoryId,
                name: c.name,
                type: c.type,
                color: c.color,
                kind: 'predefined',
              })
            }
            onDelete={() =>
              onDelete({
                categoryId: c.categoryId,
                name: c.name,
                kind: 'predefined',
              })
            }
          />
        ))}
      </Section>
    </div>
  );
};
