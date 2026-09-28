import { useFavorites } from './favorites';
import { Link } from './router';
import { ProductCard, ProductGridSkeleton, EmptyState, ErrorState, productGridClass } from './ProductCard';
import { RecommendationCarousel } from './RecommendationCarousel';
import { Heart } from 'lucide-react';
import { useSeo } from './seo';
import { button, cx, shell } from './design';

export function FavoritesPage() {
  const { favorites, count, loading, error, retry } = useFavorites();

  useSeo({ title: 'Sevimlilar', description: 'Siz saqlab qo‘ygan mahsulotlar.', noindex: true });

  return (
    <div className={cx(shell, 'py-5 lg:py-8')}>
      <h1 className="text-display-sm">Sevimlilar</h1>
      {count > 0 && <p className="mt-1 text-sm text-ink-500">{count} ta mahsulot</p>}

      <div className="mt-6">
        {/*
          Ilgari bu sahifa "Sevimlilarni ko'rish uchun tizimga kiring" deb
          turardi, sevimlilar esa aslida localStorage'da saqlanadi va
          header'dagi nishoncha ularni sanab ham turardi — ya'ni sahifa
          o'zining nishonchasiga zid javob berardi. Auth to'sig'i olib
          tashlandi: mehmon ham o'z sevimlilarini ko'radi.
        */}
        {loading && count > 0 ? (
          <ProductGridSkeleton count={Math.min(count, 10)} />
        ) : error ? (
          <ErrorState message="Sevimlilarni yuklab bo‘lmadi" onRetry={retry} />
        ) : favorites.length === 0 ? (
          <>
            <EmptyState
              title="Sevimlilar ro‘yxati bo‘sh"
              message="Mahsulot kartasidagi yurakcha tugmasini bosing — u shu yerda saqlanadi."
              icon={<Heart className="h-6 w-6" />}
              action={
                <Link to="/catalog" className={button('primary', 'md')}>
                  Katalogga o‘tish
                </Link>
              }
            />
            {/* Bo'sh ro'yxat o'rniga darhol tanlash mumkin bo'lgan takliflar. */}
            <RecommendationCarousel />
          </>
        ) : (
          <div className={productGridClass}>
            {favorites.map((f) => (f.product ? <ProductCard key={f.product_id} product={f.product} /> : null))}
          </div>
        )}
      </div>
    </div>
  );
}
