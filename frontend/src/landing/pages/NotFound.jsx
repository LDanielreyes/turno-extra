import PageHead from '../components/PageHead'
import useMeta from './useMeta'

export default function NotFound({ content }) {
  useMeta(content.meta)
  return (
    <main style={{ minHeight: '70svh' }}>
      <PageHead title={content.hero.title} lede={content.hero.lede} cta={content.cta} />
    </main>
  )
}
