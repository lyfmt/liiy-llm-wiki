import { BookOpen, Clock, Link2, List, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { KnowledgePageResponse } from '@/lib/types';
import { clampTags, formatDateLabel, type MarkdownHeading } from '@/lib/utils';

export function ReadingSidebar({ data, headings }: { data: KnowledgePageResponse; headings: MarkdownHeading[] }) {
  const tags = clampTags(data.page.tags, 3);
  const taxonomyItems = (data.navigation.taxonomy ?? []).slice(0, 3);
  const sectionItems = (data.navigation.sections ?? []).slice(0, 3);
  const entityItems = (data.navigation.entities ?? []).slice(0, 3);
  const assertionItems = (data.navigation.assertions ?? []).slice(0, 2);
  const hasGraphNavigation = taxonomyItems.length > 0 || sectionItems.length > 0 || entityItems.length > 0 || assertionItems.length > 0;

  return (
    <aside className="w-full lg:w-[260px] lg:flex-none">
      <div className="lg:sticky lg:top-0 lg:h-screen lg:border-r lg:border-gray-100 lg:bg-[#F4F7FA] lg:px-6 lg:py-8">
        <div className="lg:h-full lg:overflow-hidden">
          <Card className="border-gray-100 bg-[#F4F7FA] backdrop-blur-none lg:h-full lg:border-0 lg:bg-transparent lg:shadow-none">
            <CardContent className="p-6 lg:flex lg:h-full lg:flex-col lg:p-0">
              <a href="/app" className="inline-flex items-center gap-2 font-medium text-[#5D6D7E] transition-colors hover:text-[#1C2833]">
                <BookOpen size={18} />
                返回主页
              </a>

              <div className="mt-10 lg:min-h-0 lg:flex-1 lg:overflow-hidden">
                <ScrollArea className="pr-2 lg:h-full">
                  <div className="space-y-6 pb-6">
                    {headings.length > 0 ? (
                      <section>
                        <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                          <List size={14} /> 目录
                        </h4>
                        <nav className="flex flex-col gap-3 text-sm">
                          {headings.map((heading, index) => (
                            <a
                              key={heading.id}
                              href={`#${heading.id}`}
                              className={`border-l-2 transition-all duration-200 ${
                                index === 0 
                                  ? 'border-[#66CCFF] text-[#66CCFF] font-bold pl-3' 
                                  : 'border-transparent text-[#5D6D7E] hover:border-[#66CCFF]/30 hover:text-[#1C2833] pl-3'
                              } ${heading.depth === 3 ? 'pl-6 text-xs' : ''}`}
                            >
                              {heading.text}
                            </a>
                          ))}
                        </nav>
                      </section>
                    ) : null}

                    <section>
                      <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                        <Tag size={14} /> 页面信息
                      </h4>
                      <div className="space-y-3 text-sm text-[#5D6D7E]">
                        <FactRow label="类型" value={data.page.kind} />
                        <FactRow label="状态" value={data.page.status} />
                        <FactRow label="更新时间" value={formatDateLabel(data.page.updated_at)} />
                        <div>
                          <div className="font-semibold text-[#1C2833]">标签</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {tags.length > 0 ? tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : <Badge variant="neutral">暂无标签</Badge>}
                          </div>
                        </div>
                      </div>
                    </section>

                    <Separator className="bg-gray-200" />

                    <section>
                      <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                        <List size={14} /> 图谱概览
                      </h4>
                      {hasGraphNavigation ? (
                        <div className="space-y-4 text-sm">
                          <SidebarGroup label="分类">
                            {taxonomyItems.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {taxonomyItems.map((item) => (
                                  <Badge key={item.id} variant="neutral">
                                    {item.title}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <EmptyStateText>暂无分类信息。</EmptyStateText>
                            )}
                          </SidebarGroup>

                          <SidebarGroup label="章节">
                            {sectionItems.length > 0 ? (
                              <div className="mt-2 space-y-2">
                                {sectionItems.map((item) => (
                                  <GraphNavCard key={item.id} title={item.title} description={item.summary || '暂无章节摘要。'} />
                                ))}
                              </div>
                            ) : (
                              <EmptyStateText>暂无章节信息。</EmptyStateText>
                            )}
                          </SidebarGroup>

                          <SidebarGroup label="关键实体">
                            {entityItems.length > 0 ? (
                              <div className="mt-2 space-y-2">
                                {entityItems.map((item) => (
                                  <GraphNavCard key={item.id} title={item.title} description={item.summary || '暂无实体摘要。'} />
                                ))}
                              </div>
                            ) : (
                              <EmptyStateText>暂无关键实体。</EmptyStateText>
                            )}
                          </SidebarGroup>

                          <SidebarGroup label="核心陈述">
                            {assertionItems.length > 0 ? (
                              <div className="mt-2 space-y-2">
                                {assertionItems.map((item) => (
                                  <GraphNavCard
                                    key={item.id}
                                    title={item.title}
                                    description={item.statement}
                                    meta={`证据 ${item.evidence_count} 条`}
                                  />
                                ))}
                              </div>
                            ) : (
                              <EmptyStateText>暂无核心陈述。</EmptyStateText>
                            )}
                          </SidebarGroup>
                        </div>
                      ) : (
                        <p className="text-sm leading-7 text-[#5D6D7E]">暂无图谱主题信息。</p>
                      )}
                    </section>

                    <Separator className="bg-gray-200" />

                    <section>
                      <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                        <Clock size={14} /> 来源证据
                      </h4>
                      <div className="space-y-3">
                        {data.navigation.source_refs.length > 0 ? (
                          data.navigation.source_refs.map((sourceRef) => (
                            <Card key={sourceRef.path} className="border-white/70 bg-white shadow-none">
                              <CardContent className="p-4 text-sm">
                                <div className="font-semibold text-[#1C2833]">{sourceRef.path}</div>
                                <div className="mt-1 text-[#5D6D7E]">{sourceRef.manifest_title || sourceRef.manifest_id || 'No manifest found'}</div>
                              </CardContent>
                            </Card>
                          ))
                        ) : (
                          <p className="text-sm leading-7 text-[#5D6D7E]">暂无来源引用。</p>
                        )}
                      </div>
                    </section>

                    <Separator className="bg-gray-200" />

                    <section>
                      <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                        <Link2 size={14} /> 相关页面
                      </h4>
                      <div className="space-y-3">
                        {data.navigation.related_by_source.length > 0 ? (
                          data.navigation.related_by_source.slice(0, 3).map((item) => (
                            <a key={item.path} href={item.links.app} className="block rounded-[12px] bg-white p-4 transition-colors hover:bg-[#F9FCFF]">
                              <div className="font-semibold text-[#1C2833]">{item.title}</div>
                              <div className="mt-1 text-sm leading-6 text-[#5D6D7E]">{item.summary || '暂无摘要'}</div>
                            </a>
                          ))
                        ) : (
                          <p className="text-sm leading-7 text-[#5D6D7E]">暂无相关页面。</p>
                        )}
                      </div>
                    </section>
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </aside>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-semibold text-[#1C2833]">{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}

function SidebarGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-[#1C2833]">{label}</div>
      {children}
    </div>
  );
}

function GraphNavCard({ title, description, meta }: { title: string; description: string; meta?: string }) {
  return (
    <div className="rounded-[12px] bg-white p-4">
      <div className="font-semibold text-[#1C2833]">{title}</div>
      <div className="mt-1 text-sm leading-6 text-[#5D6D7E]">{description}</div>
      {meta ? <div className="mt-2 text-xs text-gray-400">{meta}</div> : null}
    </div>
  );
}

function EmptyStateText({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-6 text-[#5D6D7E]">{children}</p>;
}

export function RelatedPagesPanel({ data }: { data: KnowledgePageResponse }) {
  return (
    <Card className="bg-white">
      <CardHeader>
        <CardTitle>Shared-source context</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {data.navigation.related_by_source.length > 0 ? (
          data.navigation.related_by_source.map((item) => (
            <a key={item.path} href={item.links.app} className="rounded-[16px] border border-gray-100 p-5 transition hover:-translate-y-0.5 hover:border-[#66CCFF]/30 hover:shadow-[0_4px_20px_rgba(102,204,255,0.15)]">
              <div className="text-lg font-bold text-[#1C2833]">{item.title}</div>
              <p className="mt-2 text-sm leading-7 text-[#5D6D7E]">{item.summary || '暂无摘要。'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.shared_source_refs.map((ref) => (
                  <Badge key={ref} variant="accent">
                    {ref}
                  </Badge>
                ))}
              </div>
            </a>
          ))
        ) : (
          <p className="text-sm leading-7 text-[#5D6D7E]">当前还没有共享来源的相关页面。</p>
        )}
      </CardContent>
    </Card>
  );
}
