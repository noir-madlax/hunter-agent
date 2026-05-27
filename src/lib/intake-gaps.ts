export type ProjectGapBuckets = {
  blocking: string[];
  nonBlocking: string[];
};

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function isBlockingIntakeGap(gap: string) {
  const text = gap.trim();
  if (!text) return false;

  if (/客户公司(是否|可以|能否|未|待|需要|确认)|^客户公司$|保密客户/.test(text)) return true;
  if (/目标岗位|岗位名称|职能主轴|role\s*title/i.test(text)) return true;
  if (/实际\s*base|base\s*城市|工作地点|办公模式|地点\/办公|location|work\s*model/i.test(text)) return true;

  return false;
}

export function classifyProjectGaps(gaps: string[]): ProjectGapBuckets {
  const blocking: string[] = [];
  const nonBlocking: string[] = [];

  for (const gap of unique(gaps)) {
    if (isBlockingIntakeGap(gap)) {
      blocking.push(gap);
    } else {
      nonBlocking.push(gap);
    }
  }

  return { blocking, nonBlocking };
}
