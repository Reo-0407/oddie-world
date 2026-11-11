/** 챔피언을 이긴 뒤의 엔딩 화면 */
export function Credits({ onClose }: { onClose(): void }) {
  return (
    <div className="credits" role="dialog" aria-label="엔딩">
      <div className="credits-roll">
        <h1>축하해, 챔피언!</h1>
        <p>초원·사막·설원·화산의 관장을 모두 이기고<br />챔피언 하늘까지 이겼어요.</p>
        <p>함께 모험해 준 오디들과<br />끝까지 플레이해 준 너에게 고마워요!</p>
        <p className="credits-small">오디 캐릭터: 「Catch an Oddie」<br />학교 활동으로 만든 게임입니다.</p>
        <button type="button" className="wide" onClick={onClose}>전당으로 돌아가기</button>
      </div>
    </div>
  );
}
