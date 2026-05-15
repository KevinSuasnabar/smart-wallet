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
  onDeleteCustom,
}: CategoryListProps) => {
  const hasCustom = custom.length > 0;

  return (
    <div className="flex flex-col gap-10">
      {hasCustom && (
        <Section eyebrow="Tuyas" title="Personalizadas">
          {custom.map((c) => (
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

      <Section eyebrow="Del sistema" title="Predefinidas">
        {predefined.map((c) => (
          <CategoryItem
            key={c.categoryId}
            name={c.name}
            type={c.type}
            isCustom={false}
          />
        ))}
      </Section>
    </div>
  );
};
