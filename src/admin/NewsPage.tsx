// Admin page for ingested news (/admin/news), read-only. There is no manual "add news"
// form — articles come from the ingestion pipeline only.
// The impact line and the bullish/bearish direction are derived display heuristics
// (src/lib/news.ts), not model output; unscored rows show "—" rather than a guess.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { NewsArticle } from '../api/types';
import { formatDate, mapPolicyDirection } from '../lib/format';
import { deriveNewsDirection, isAgriNews, primaryTopic, NEWS_TOPIC_PRIORITY } from '../lib/news';
import {
  AdminEmpty,
  AdminError,
  AdminLoading,
  AdminPagination,
  AdminTopbar,
  DemoNote,
  EnumBadge,
  usePagination,
} from './adminShared';

// Filter option order: the two rollups first, then topics in display priority.
const FILTERS = ['agri', 'all', ...NEWS_TOPIC_PRIORITY] as const;
type Filter = (typeof FILTERS)[number];

const FETCH_WINDOW = 200; // server max — gives the agri filter depth beyond one day's headlines

export default function NewsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<Filter>('agri');

  const load = useCallback(async () => {
    setArticles(null);
    setError(false);
    try {
      setArticles(await api.getNewsArticles(FETCH_WINDOW));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const list = articles ?? [];
    if (filter === 'all') return list;
    if (filter === 'agri') return list.filter((a) => isAgriNews(a.topics));
    return list.filter((a) => primaryTopic(a.topics) === filter);
  }, [articles, filter]);

  const pager = usePagination(filtered);

  return (
    <>
      <AdminTopbar
        title={t('admin.news.title')}
        subtitle={t('admin.news.subtitle')}
        hint={t('admin.news.explainer')}
        hintId="adm-news-hint"
      />
      <section className="panel adm" aria-label={t('admin.news.title')}>
        <DemoNote />

        <div className="adm-toolbar">
          <label className="adm-field ing-filter">
            <span className="wrap-label">{t('admin.news.filterLabel')}</span>
            <select
              className="adm-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
            >
              <option value="agri">{t('admin.news.filterAgri')}</option>
              <option value="all">{t('admin.news.filterAll')}</option>
              {NEWS_TOPIC_PRIORITY.map((topic) => (
                <option key={topic} value={topic}>
                  {t(`admin.news.topic.${topic}`)}
                </option>
              ))}
            </select>
          </label>
          <span />
        </div>

        {error ? (
          <AdminError onRetry={() => void load()} />
        ) : articles === null ? (
          <AdminLoading />
        ) : articles.length === 0 ? (
          <AdminEmpty title={t('admin.news.emptyTitle')} body={t('admin.news.emptyBody')} />
        ) : filtered.length === 0 ? (
          <AdminEmpty title={t('admin.news.emptyTitle')} body={t('admin.news.emptyFiltered')} />
        ) : (
          <>
            <div className="adm-tablewrap">
              <table className="adm-table">
                <caption className="sr-only">{t('admin.news.title')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('admin.news.colPublished')}</th>
                    <th scope="col">{t('admin.news.colCategory')}</th>
                    <th scope="col">{t('admin.news.colHeadline')}</th>
                    <th scope="col">{t('admin.news.colEffect')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pager.pageRows.map((a) => {
                    const topic = primaryTopic(a.topics);
                    const direction = deriveNewsDirection(a.topics, a.sentimentScore);
                    const dir = direction === null ? null : mapPolicyDirection(direction);
                    return (
                      <tr key={a.url}>
                        <td data-label={t('admin.news.colPublished')}>
                          {/* Null publish date (feed omitted it) falls back to fetch time. */}
                          {formatDate((a.publishedDateUtc ?? a.retrievedAtUtc).slice(0, 10), lang)}
                        </td>
                        <td data-label={t('admin.news.colCategory')}>
                          {a.topics === null ? (
                            <span className="adm-muted">—</span>
                          ) : (
                            <EnumBadge
                              labelKey={`admin.news.topic.${topic ?? 'general'}`}
                              fallback={topic ?? 'general'}
                            />
                          )}
                        </td>
                        <th scope="row" className="adm-c-title" data-label={t('admin.news.colHeadline')}>
                          <span className="adm-title">
                            <a className="adm-reflink" href={a.url} target="_blank" rel="noreferrer noopener">
                              {decodeEntities(a.title)}
                              <span aria-hidden="true"> ↗</span>
                            </a>
                          </span>
                          {/* Farmer-facing impact line — how this KIND of news affects prices,
                              not a summary of the article (the link is the article). */}
                          <span className="adm-desc">
                            {t(`admin.news.impact.${a.topics === null ? 'unscored' : (topic ?? 'general')}`)}
                          </span>
                        </th>
                        <td data-label={t('admin.news.colEffect')}>
                          {dir === null ? (
                            <span className="adm-muted">—</span>
                          ) : (
                            <EnumBadge
                              labelKey={dir.labelKey}
                              fallback={dir.fallback}
                              glyph={dir.glyph}
                              className={`adm-badge--dir${dir.tone ? ` is-${dir.tone}` : ''}`}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <AdminPagination {...pager} />
            </div>
          </>
        )}
      </section>
    </>
  );
}

// Feed titles arrive with HTML entities. DOMParser textContent gives back plain text
// only, so nothing from the feed can reach the DOM as markup.
function decodeEntities(s: string): string {
  const doc = new DOMParser().parseFromString(s, 'text/html');
  return doc.documentElement.textContent ?? s;
}
