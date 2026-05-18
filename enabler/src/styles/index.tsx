import classNames from "classnames";

export const HOSTED_FIELDS_LABEL = "uppercase text-sm block mb-1.5";

export const HOSTED_FIELDS =
  "h-12 box-border w-full inline-block shadow-none font-semibold text-sm rounded-md border border-violet-50 leading-5 bg-slate-50 mb-3";

export const renderMaskButtonClasses = (
  fullWidth: boolean,
  addEnabledClasses: boolean,
  addDisabledClasses: Boolean
): string => {
  return classNames({
    "justify-center align-center rounded-md px-4 py-2 text-sm font-medium focus:outline-none text-white shadow-sm":
      true,
    "w-full": fullWidth,
    "focus:ring-2 focus:ring-blue-500 bg-blue-500 hover:bg-blue-600 ":
      addEnabledClasses,
    "bg-gray-500": addDisabledClasses,
  });
};
